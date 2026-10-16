import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Home, CreditCard, FileText, Wrench, User, MessageCircle, Bell, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';

type InvoiceNotification = {
  id: string;
  invoice_id: string | null;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

export default function TenantDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user, profile } = useAuth();
  const { t, fmt, language } = useTheme();
  const [tenant, setTenant] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [customPaymentMethods, setCustomPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [unpaidInvoiceCount, setUnpaidInvoiceCount] = useState(0);
  const [invoiceNotifications, setInvoiceNotifications] = useState<InvoiceNotification[]>([]);
  const { toasts, addToast, removeToast } = useToast();

  const loadInvoiceDashboardData = useCallback(async (tenantId: string, userId: string) => {
    const [invoiceResult, notificationResult] = await Promise.all([
      supabase
        .from('utility_invoices')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('status', ['unpaid', 'partial']),
      supabase
        .from('notifications')
        .select('id, invoice_id, title, message, created_at, is_read')
        .eq('user_id', userId)
        .eq('link', 'tenant-invoices')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (invoiceResult.error) {
      addToast(`Unable to load unpaid invoices: ${invoiceResult.error.message}`, 'error');
      setUnpaidInvoiceCount(0);
      setInvoiceNotifications([]);
    } else {
      const unpaidInvoiceIds = new Set((invoiceResult.data ?? []).map(invoice => invoice.id));
      setUnpaidInvoiceCount(unpaidInvoiceIds.size);
      if (!notificationResult.error) {
        setInvoiceNotifications((notificationResult.data ?? []).filter(
          notification => notification.invoice_id && unpaidInvoiceIds.has(notification.invoice_id),
        ));
      }
    }
    if (notificationResult.error) {
      addToast(`Unable to load invoice notifications: ${notificationResult.error.message}`, 'error');
    }
  }, [addToast]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('tenants').select('*, houses(house_number, status, monthly_rent, house_categories(name))').eq('user_id', user.id).maybeSingle(),
      supabase.from('settings').select('key, value').in('key', [
        'property_name', 'bank_name', 'account_name', 'account_number',
        'mobile_money_number', 'payment_reference', 'custom_payment_methods',
      ]),
    ]).then(([t, s]) => {
      setTenant(t.data);
      if (s.error) {
        addToast(`Unable to load payment instructions: ${s.error.message}`, 'error');
      }
      const map: Record<string, string> = {};
      (s.data ?? []).forEach(x => { map[x.key] = x.value ?? ''; });
      setSettings(map);
      try {
        setCustomPaymentMethods(parseCustomPaymentMethods(map.custom_payment_methods));
      } catch (error) {
        addToast(`Unable to load payment methods: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      if (t.data?.id) {
        supabase.from('payments').select('*').eq('tenant_id', t.data.id).order('created_at', { ascending: false }).limit(5)
          .then(({ data }) => setPayments(data ?? []));
        supabase.from('maintenance_requests').select('id, status')
          .eq('tenant_id', t.data.id)
          .then(({ data: reqs }) => {
            const active = (reqs ?? []).filter(r => r.status !== 'completed' && r.status !== 'rejected').length;
            setMaintenanceCount(active);
          });
      }
    });
  }, [user, addToast]);

  useEffect(() => {
    if (!tenant?.id || !user) return;
    void loadInvoiceDashboardData(tenant.id, user.id);
    const channel = supabase
      .channel(`tenant-dashboard-invoices-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void loadInvoiceDashboardData(tenant.id, user.id); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'utility_invoices', filter: `tenant_id=eq.${tenant.id}` },
        () => { void loadInvoiceDashboardData(tenant.id, user.id); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tenant?.id, user, loadInvoiceDashboardData]);

  const openInvoiceNotification = async (notification: InvoiceNotification) => {
    if (!notification.is_read) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id);
      if (error) {
        addToast(`Unable to mark invoice notification as read: ${error.message}`, 'error');
      } else {
        setInvoiceNotifications(current => current.map(item =>
          item.id === notification.id ? { ...item, is_read: true } : item,
        ));
      }
    }
    onNavigate('tenant-invoices');
  };

  const statusColors: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    partial: 'bg-blue-50 text-blue-700',
    overdue: 'bg-red-50 text-red-700',
  };

  const panelClass = 'bg-white border border-slate-200 rounded-2xl p-5';

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <DashboardWelcomeHero
        title={t('myDashboard')}
        subtitle={`${t('welcomeBack')}, ${profile?.full_name ?? ''}`}
      />

      {invoiceNotifications.map(notification => (
        <button
          key={notification.id}
          type="button"
          onClick={() => { void openInvoiceNotification(notification); }}
          className={`flex w-full items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-800 transition-colors hover:bg-red-100 ${notification.is_read ? 'opacity-75' : ''}`}
        >
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
          <span className="flex-1">
            <span className="block font-semibold">{notification.title}</span>
            <span className="mt-0.5 block text-sm">{notification.message}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold underline">
            {language === 'fr' ? 'Voir la facture' : 'View invoice'}
          </span>
        </button>
      ))}
      {unpaidInvoiceCount > 0 && invoiceNotifications.length === 0 && (
        <button
          type="button"
          onClick={() => onNavigate('tenant-invoices')}
          className="flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-800 transition-colors hover:bg-red-100"
        >
          <AlertCircle className="h-6 w-6 shrink-0 text-red-600" />
          <span className="flex-1">
            <span className="block font-semibold">
              {unpaidInvoiceCount} {unpaidInvoiceCount === 1
                ? (language === 'fr' ? 'facture impayée' : 'unpaid invoice')
                : (language === 'fr' ? 'factures impayées' : 'unpaid invoices')}
            </span>
            <span className="block text-sm">
              {language === 'fr'
                ? 'Consultez vos factures et les montants restant à payer.'
                : 'Review your invoices and the amounts still due.'}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold underline">
            {language === 'fr' ? 'Voir les factures' : 'View invoices'}
          </span>
        </button>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { icon: CreditCard, label: t('tenant-payments'), page: 'tenant-payments', color: '#0ea5e9' },
          { icon: Wrench,     label: t('tenant-maintenance'), page: 'tenant-maintenance', color: '#f59e0b', badge: maintenanceCount },
          { icon: FileText,   label: t('tenant-agreement'), page: 'tenant-agreement', color: '#8b5cf6' },
          { icon: MessageCircle, label: t('tenant-chat'), page: 'tenant-chat', color: '#10b981' },
          { icon: Bell,        label: t('notifications'), page: 'notifications', color: '#6366f1' },
        ].map(item => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className="relative flex flex-col items-center justify-center gap-2 py-4 bg-white border border-slate-200 rounded-2xl transition-all hover:shadow-md hover:border-slate-300"
          >
            <item.icon className="w-5 h-5" style={{ color: item.color }} />
            <span className="text-xs font-medium text-slate-600">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white bg-red-500">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile & House */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={panelClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100">
              <User className="w-5 h-5 text-slate-500" />
            </div>
            <h3 className="font-semibold text-slate-900">{t('myProfile')}</h3>
          </div>
          {tenant ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">{t('id')}</span><span className="text-slate-900">{tenant.tenant_code}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('name')}</span><span className="text-slate-900">{tenant.full_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('phone')}</span><span className="text-slate-900">{tenant.phone}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('email')}</span><span className="text-slate-900 truncate max-w-[180px]">{tenant.email}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('status')}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${tenant.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{tenant.status}</span>
              </div>
            </div>
          ) : <p className="text-slate-400 text-sm">{t('profileNotSetup')}</p>}
        </div>

        <div className={panelClass}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50">
              <Home className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900">{t('myHouse')}</h3>
          </div>
          {tenant?.houses ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">{t('houseNumber')}</span><span className="text-slate-900 font-semibold">{tenant.houses.house_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('category')}</span><span className="text-slate-900">{tenant.houses.house_categories?.name ?? '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-400">{t('monthlyRent')}</span><span className="text-slate-900 font-semibold money-value">{fmt(Number(tenant.monthly_rent ?? tenant.houses.monthly_rent))}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">{t('moveIn')}</span><span className="text-slate-900">{tenant.move_in_date ? new Date(tenant.move_in_date).toLocaleDateString('en-GB') : '—'}</span></div>
            </div>
          ) : <p className="text-slate-400 text-sm">{t('noHouseAssigned')}</p>}
        </div>
      </div>

      {/* Payment Instructions */}
      {(settings.property_name || settings.bank_name || settings.account_name || settings.account_number ||
        settings.mobile_money_number || settings.payment_reference || customPaymentMethods.length > 0) && (
        <div className={panelClass}>
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" /> {t('paymentInstructions')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {settings.property_name && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Property</p><p className="text-slate-900 font-medium">{settings.property_name}</p></div>}
            {settings.bank_name && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Bank Name</p><p className="text-slate-900 font-medium">{settings.bank_name}</p></div>}
            {settings.account_name && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Account Name</p><p className="text-slate-900 font-medium">{settings.account_name}</p></div>}
            {settings.account_number && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Account Number</p><p className="text-slate-900 font-medium">{settings.account_number}</p></div>}
            {settings.mobile_money_number && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Mobile Money</p><p className="text-slate-900 font-medium">{settings.mobile_money_number}</p></div>}
            {settings.payment_reference && <div className="rounded-xl p-3 bg-slate-50"><p className="text-slate-400 text-xs mb-0.5">Reference</p><p className="text-slate-900 font-medium">{settings.payment_reference}</p></div>}
            {customPaymentMethods.map(method => (
              <div key={method.id} className="rounded-xl bg-slate-50 p-3">
                <p className="mb-0.5 text-xs text-slate-400">{method.name}</p>
                <p className="whitespace-pre-wrap break-words font-medium text-slate-900">{method.instructions}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      <div className={panelClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-slate-400" /> {t('recentPayments')}</h3>
          <button onClick={() => onNavigate('tenant-payments')} className="text-xs font-medium text-slate-900 hover:underline">{t('viewAll')}</button>
        </div>
        {payments.length === 0 && <p className="text-slate-400 text-sm">{t('noPaymentRecords')}</p>}
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <div>
                <p className="text-sm text-slate-900 font-medium">{p.receipt_number}</p>
                <p className="text-xs text-slate-400">{new Date(p.rent_month).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(p.amount_paid))}</span></p>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColors[p.status] ?? 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
