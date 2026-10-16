import React, { useCallback, useEffect, useState } from 'react';
import { Printer, ReceiptText } from 'lucide-react';
import { supabase, UtilityInvoice } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import InvoiceDocument from '@/components/InvoiceDocument';
import { printDocument } from '@/lib/print';
import { calculateInvoiceChargeBalances } from '@/lib/invoiceBalances';

const invoiceSelect = '*, tenants(full_name, tenant_code, houses(house_number)), houses(house_number)';

export default function TenantInvoicesPage() {
  const { user } = useAuth();
  const { fmt, t, language } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [invoices, setInvoices] = useState<UtilityInvoice[]>([]);
  const [selected, setSelected] = useState<UtilityInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data, error }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase
        .from('utility_invoices')
        .select(invoiceSelect)
        .in('status', ['unpaid', 'partial'])
        .order('rent_month', { ascending: false }),
      supabase
        .from('payments')
        .select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount'),
    ]);
    if (error) {
      addToast(
        error.code === 'PGRST205'
          ? (language === 'fr'
            ? 'La table des factures est absente de Supabase. L’administrateur doit appliquer les migrations en attente, notamment 20261011070000_add_utility_invoices.sql.'
            : 'The invoice table is missing from Supabase. The administrator must apply the pending migrations, including 20261011070000_add_utility_invoices.sql.')
          : error.message,
        'error',
      );
    }
    else {
      if (paymentsError) {
        addToast(`Unable to load utility payment balances: ${paymentsError.message}`, 'error');
      }
      const invoiceRows = (data ?? []) as UtilityInvoice[];
      const balances = calculateInvoiceChargeBalances(invoiceRows, payments ?? []);
      setInvoices(invoiceRows.map(invoice => ({ ...invoice, ...balances.get(invoice.id) })));
    }
    setLoading(false);
  }, [user, addToast, language]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tenant-invoice-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('tenant-invoices')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('invoiceRentUtilities')}</p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('loading')}</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center">
          <ReceiptText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">{t('noInvoices')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {invoices.map(invoice => (
            <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{invoice.invoice_number}</p>
                  <h2 className="mt-1 text-lg font-semibold capitalize text-slate-900">
                    {new Date(`${invoice.rent_month.slice(0, 7)}-01`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' })}
                  </h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {invoice.status === 'partial' ? t('partiallyUnpaid') : t(invoice.status)}
                </span>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between gap-2"><span className="text-slate-500">{t('rent')}</span><span className="money-value">{fmt(Number(invoice.rent_amount))}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">{t('additionalCharges')} — {t('water')}</span><span className="money-value">{fmt(Number(invoice.water_amount))}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">{t('additionalCharges')} — {t('electricity')}</span><span className="money-value">{fmt(Number(invoice.electricity_amount))}</span></div>
                <div className="flex justify-between gap-2 border-t border-slate-200 pt-3 font-bold"><span>{t('totalDue')}</span><span className="money-value">{fmt(Number(invoice.total_amount))}</span></div>
                {Number(invoice.rent_balance) > 0 && (
                  <div className="flex justify-between gap-2 text-amber-700">
                    <span>{t('rentBalanceDue')}</span>
                    <span className="money-value">{fmt(Number(invoice.rent_balance))}</span>
                  </div>
                )}
                {Number(invoice.water_balance) > 0 && (
                  <div className="flex justify-between gap-2 text-amber-700">
                    <span>{t('waterBalanceDue')}</span>
                    <span className="money-value">{fmt(Number(invoice.water_balance))}</span>
                  </div>
                )}
                {Number(invoice.electricity_balance) > 0 && (
                  <div className="flex justify-between gap-2 text-amber-700">
                    <span>{t('electricityBalanceDue')}</span>
                    <span className="money-value">{fmt(Number(invoice.electricity_balance))}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t border-slate-200 pt-3 font-bold text-red-700">
                  <span>{t('totalBalanceDue')}</span>
                  <span className="money-value">{fmt(Number(invoice.total_balance_due ?? invoice.rent_balance))}</span>
                </div>
                {Number(invoice.rent_credit) > 0 && (
                  <div className="flex justify-between gap-2 text-emerald-700">
                    <span>{t('rentCredit')}</span>
                    <span className="money-value">{fmt(Number(invoice.rent_credit))}</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">{t('rentBalanceCreditNote')}</p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">{t('invoiceDueDate')}: {new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')}</p>
                <Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => setSelected(invoice)}>
                  {t('printSavePdf')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('invoice')} size="lg">
        {selected && <InvoiceDocument invoice={selected} />}
        <div className="mt-4 flex justify-end">
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => printDocument('invoice', 'invoice-print-document')}>
            {t('printSavePdf')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
