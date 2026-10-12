import React, { useEffect, useState } from 'react';
import { Building2, Users, Wallet, Wrench, UserCheck, AlertCircle } from 'lucide-react';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';

interface DashboardStats {
  properties: number;
  occupied: number;
  tenants: number;
  collected: number;
  outstanding: number;
  maintenance: number;
  visitors: number;
}

const initialStats: DashboardStats = {
  properties: 0, occupied: 0, tenants: 0, collected: 0, outstanding: 0, maintenance: 0, visitors: 0,
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
      const [houseResult, tenantResult, paymentResult, maintenanceResult, visitorResult] = await Promise.all([
        supabase.from('houses').select('id, status'),
        supabase.from('tenants').select('id, status'),
        supabase.from('payments').select('amount_due, amount_paid, status'),
        supabase.from('maintenance_requests').select('id, status').not('status', 'in', '(completed,rejected)'),
        supabase.from('visitors').select('id, status').eq('status', 'inside'),
      ]);
      const error = houseResult.error ?? tenantResult.error ?? paymentResult.error ?? maintenanceResult.error ?? visitorResult.error;
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
          outstanding: payments.reduce((sum, payment) => sum + Math.max(Number(payment.amount_due || 0) - Number(payment.amount_paid || 0), 0), 0),
          maintenance: maintenance.length,
          visitors: visitors.length,
        });
      }
      setLoading(false);
    };
    load();
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
        setAssignedProperties((houseResult.data ?? []).map(house =>
          `${house.property_id ? propertyNames.get(house.property_id) ?? 'Property' : 'Property'} · ${house.house_number}`));
      } catch (caught: unknown) {
        addToast(`Unable to load assigned properties: ${caught instanceof Error ? caught.message : 'Unknown error'}`, 'error');
      }
    };
    void loadAssignedProperties();
  }, [profile, addToast]);

  const labels = language === 'fr'
    ? { title: 'Tableau de bord', subtitle: 'Aperçu des maisons qui vous sont attribuées', properties: 'Maisons attribuées', occupied: 'Maisons occupées', tenants: 'Locataires actifs', collected: 'Loyers encaissés', outstanding: 'Loyers en attente', maintenance: 'Maintenances ouvertes', visitors: 'Visiteurs présents' }
    : { title: 'Property Manager Dashboard', subtitle: 'Overview of houses assigned to you', properties: 'Assigned Houses', occupied: 'Occupied Houses', tenants: 'Active Tenants', collected: 'Rent Collected', outstanding: 'Outstanding Rent', maintenance: 'Open Maintenance', visitors: 'Visitors Inside' };

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
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <DashboardWelcomeHero
        title={`${labels.title}${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle={labels.subtitle}
      />
      {profile && <StaffIdentityCard profile={profile} assignedProperties={assignedProperties} showIdentityDocument={false} />}
      <section aria-label={labels.title} className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] sm:p-5">
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full ${card.color}`}>
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className={`break-words font-bold tracking-tight text-slate-900 ${card.money ? 'money-value text-base sm:text-lg' : 'text-2xl'}`}>
                {loading ? '—' : card.value}
              </p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500 sm:text-sm">{card.label}</p>
            </article>
          );
        })}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
  );
}
