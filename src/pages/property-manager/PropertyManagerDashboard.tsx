import React, { useEffect, useState } from 'react';
import { Building2, Users, Wallet, Wrench, UserCheck, AlertCircle } from 'lucide-react';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';
import { calculateOutstandingInvoiceBalance } from '@/lib/invoiceBalances';

interface DashboardStats {
  properties: number;
  occupied: number;
  tenants: number;
  collected: number;
  outstanding: number;
  unpaidInvoices: number;
  maintenance: number;
  visitors: number;
}

const initialStats: DashboardStats = {
  properties: 0, occupied: 0, tenants: 0, collected: 0, outstanding: 0, unpaidInvoices: 0, maintenance: 0, visitors: 0,
};

export default function PropertyManagerDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile } = useAuth();
  const { language, fmt } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [stats, setStats] = useState(initialStats);
  const [assignedProperties, setAssignedProperties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [houseResult, tenantResult, paymentResult, invoiceResult, invoiceBalanceResult, utilityPaymentResult, maintenanceResult, visitorResult] = await Promise.all([
        supabase.from('houses').select('id, status'),
        supabase.from('tenants').select('id, status'),
        supabase.from('payments').select('amount_due, amount_paid, rent_paid_amount, status'),
        supabase.from('utility_invoices').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'partial']),
        supabase.from('utility_invoices').select('id, tenant_id, rent_month, rent_balance, water_amount, electricity_amount'),
        supabase.from('payments').select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount'),
        supabase.from('maintenance_requests').select('id, status').not('status', 'in', '(completed,rejected)'),
        supabase.from('visitors').select('id, status').eq('status', 'inside'),
      ]);
      const error = houseResult.error ?? tenantResult.error ?? paymentResult.error ?? invoiceResult.error
        ?? invoiceBalanceResult.error ?? utilityPaymentResult.error ?? maintenanceResult.error ?? visitorResult.error;
      if (error) {
        addToast(`Unable to load dashboard metrics: ${error.message}`, 'error');
      } else {
        const houses = houseResult.data ?? [];
        const tenants = tenantResult.data ?? [];
        const payments = paymentResult.data ?? [];
        const maintenance = maintenanceResult.data ?? [];
        const visitors = visitorResult.data ?? [];
        setStats({
          properties: houses.length,
          occupied: houses.filter(house => house.status === 'occupied').length,
          tenants: tenants.filter(tenant => tenant.status === 'active').length,
          collected: payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0),
          outstanding: calculateOutstandingInvoiceBalance(invoiceBalanceResult.data ?? [], utilityPaymentResult.data ?? []),
          unpaidInvoices: invoiceResult.count ?? 0,
          maintenance: maintenance.length,
          visitors: visitors.length,
        });
      }
      setLoading(false);
    };
    void load();
    const channel = supabase
      .channel('property-manager-invoice-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utility_invoices' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [addToast]);

  useEffect(() => {
    if (!profile) return;
    const loadAssignedProperties = async () => {
      try {
        const { data, error } = await supabase.from('property_manager_houses')
          .select('house_id')
          .eq('manager_id', profile.id);
        if (error) {
          addToast(`Unable to load assigned properties: ${error.message}`, 'error');
          return;
        }
        const houseIds = (data ?? []).map(item => item.house_id);
        if (houseIds.length === 0) {
          setAssignedProperties([]);
          return;
        }
        const [houseResult, propertyResult] = await Promise.all([
          supabase.from('houses').select('house_number, property_id').in('id', houseIds),
          supabase.from('properties').select('id, name'),
        ]);
        const loadError = houseResult.error ?? propertyResult.error;
        if (loadError) {
          addToast(`Unable to load assigned house details: ${loadError.message}`, 'error');
          return;
        }
        const propertyNames = new Map((propertyResult.data ?? []).map(property => [property.id, property.name]));
        setAssignedProperties([...new Set((houseResult.data ?? []).map(house =>
          house.property_id ? propertyNames.get(house.property_id) ?? 'Property' : 'Property'))]);
      } catch (caught: unknown) {
        addToast(`Unable to load assigned properties: ${caught instanceof Error ? caught.message : 'Unknown error'}`, 'error');
      }
    };
    void loadAssignedProperties();
  }, [profile, addToast]);

  const labels = language === 'fr'
    ? { title: 'Tableau de bord', subtitle: 'Aperçu des maisons qui vous sont attribuées', properties: 'Maisons attribuées', occupied: 'Maisons occupées', tenants: 'Locataires actifs', collected: 'Loyers encaissés', outstanding: 'Solde total restant', maintenance: 'Maintenances ouvertes', visitors: 'Visiteurs présents' }
    : { title: 'Property Manager Dashboard', subtitle: 'Overview of houses assigned to you', properties: 'Assigned Houses', occupied: 'Occupied Houses', tenants: 'Active Tenants', collected: 'Rent Collected', outstanding: 'Outstanding Balance', maintenance: 'Open Maintenance', visitors: 'Visitors Inside' };

  const cards = [
    { label: labels.properties, value: stats.properties, icon: Building2, color: 'text-emerald-700 bg-emerald-50' },
    { label: labels.occupied, value: `${stats.occupied} / ${stats.properties}`, icon: Building2, color: 'text-slate-700 bg-slate-100' },
    { label: labels.tenants, value: stats.tenants, icon: Users, color: 'text-blue-700 bg-blue-50' },
    { label: labels.collected, value: fmt(stats.collected), icon: Wallet, color: 'text-emerald-700 bg-emerald-50', money: true },
    { label: labels.outstanding, value: fmt(stats.outstanding), icon: AlertCircle, color: 'text-red-700 bg-red-50', money: true },
    { label: labels.maintenance, value: stats.maintenance, icon: Wrench, color: 'text-amber-700 bg-amber-50' },
    { label: labels.visitors, value: stats.visitors, icon: UserCheck, color: 'text-violet-700 bg-violet-50' },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <DashboardWelcomeHero
        title={`${labels.title}${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle={labels.subtitle}
      />
      {stats.unpaidInvoices > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="flex w-full items-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-left shadow-sm transition-colors hover:bg-red-100 sm:gap-4 sm:p-5"
        >
          <AlertCircle className="h-10 w-10 shrink-0 text-red-600 sm:h-12 sm:w-12" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-red-800">
              {stats.unpaidInvoices} {language === 'fr' ? 'factures impayées' : 'unpaid invoices'}
            </span>
            <span className="mt-1 block text-sm text-red-700">
              {language === 'fr' ? 'Consultez les factures impayées ou partiellement payées.' : 'Review unpaid or partially paid invoices.'}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">
            {language === 'fr' ? 'Voir les factures' : 'View invoices'}
          </span>
        </button>
      )}
      <div className="-mx-4 -mt-4 space-y-4 rounded-t-3xl bg-slate-200 px-4 pb-4 pt-5 sm:mx-0 sm:mt-0 sm:space-y-6 sm:rounded-none sm:bg-transparent sm:p-0">
      {profile && <StaffIdentityCard profile={profile} assignedProperties={assignedProperties} showIdentityDocument={false} />}
      <section aria-label={labels.title} className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)] sm:p-5">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full sm:mb-4 sm:h-10 sm:w-10 ${card.color}`}>
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.8} />
              </div>
              <p className={`break-words font-bold tracking-tight text-slate-900 ${card.money ? 'money-value text-sm sm:text-lg' : 'text-xl sm:text-2xl'}`}>
                {loading ? '—' : card.value}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-sm sm:leading-5">{card.label}</p>
            </article>
          );
        })}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
        <h2 className="font-semibold text-slate-900">{language === 'fr' ? 'Accès rapide' : 'Quick access'}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['houses', labels.properties], ['tenants', labels.tenants], ['payments', labels.collected],
            ['maintenance', labels.maintenance], ['visitors', labels.visitors], ['reports', language === 'fr' ? 'Rapports' : 'Reports'],
          ].map(([page, label]) => (
            <button key={page} type="button" onClick={() => onNavigate(page)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
              {label}
            </button>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
