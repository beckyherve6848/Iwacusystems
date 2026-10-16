import React, { useCallback, useEffect, useState } from 'react';
import { Payment, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Eye, Printer } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import Receipt, { ReceiptData } from '@/components/Receipt';
import { printDocument } from '@/lib/print';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { calculateMonthlyInvoiceBalances } from '@/lib/invoiceBalances';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  pending: 'bg-amber-50 text-amber-700 border-amber-700/50',
  partial: 'bg-blue-50 text-blue-700 border-blue-700/50',
  overdue: 'bg-red-50 text-red-700 border-red-700/50',
};

export default function TenantPaymentsPage() {
  const { user } = useAuth();
  const { fmt, t } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [tenant, setTenant] = useState<{ id: string } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receiptInvoiceSummary, setReceiptInvoiceSummary] = useState<{
    rentDue: number;
    waterDue: number;
    electricityDue: number;
    rentBalance: number;
    rentCredit: number;
    waterBalance: number;
    electricityBalance: number;
    totalBalance: number;
  } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const loadPayments = useCallback(async (tenantId: string, p: number) => {
    const from = (p - 1) * PER_PAGE;
    const { data, count, error } = await supabase
      .from('payments')
      .select('*, tenants(full_name, tenant_code), houses(house_number)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, from + PER_PAGE - 1);
    if (error) {
      addToast(`Unable to load payment history: ${error.message}`, 'error');
      setPayments([]);
      setTotal(0);
      return;
    }

    const rows = data ?? [];
    const rentMonths = [...new Set(rows.map(payment => payment.rent_month.slice(0, 10)))];
    if (rentMonths.length === 0) {
      setPayments([]);
      setTotal(count ?? 0);
      return;
    }
    const [invoiceResult, utilityPaymentResult] = await Promise.all([
      supabase.from('utility_invoices')
        .select('id, tenant_id, rent_month, rent_amount, rent_balance, water_amount, electricity_amount')
        .eq('tenant_id', tenantId)
        .in('rent_month', rentMonths),
      supabase.from('payments')
        .select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount')
        .eq('tenant_id', tenantId)
        .in('rent_month', rentMonths),
    ]);
    if (invoiceResult.error || utilityPaymentResult.error) {
      addToast(`Unable to load outstanding payment balances: ${invoiceResult.error?.message ?? utilityPaymentResult.error?.message}`, 'error');
      setPayments(rows);
    } else {
      const monthlyBalances = calculateMonthlyInvoiceBalances(invoiceResult.data ?? [], utilityPaymentResult.data ?? []);
      setPayments(rows.map(payment => ({
        ...payment,
        total_balance_due: monthlyBalances.get(`${payment.tenant_id}:${payment.rent_month.slice(0, 7)}`)?.total_balance_due,
      })));
    }
    setTotal(count ?? 0);
  }, [addToast]);

  useEffect(() => {
    if (!user) return;
    supabase.from('tenants').select('id').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (error) {
        addToast(`Unable to load tenant account: ${error.message}`, 'error');
        return;
      }
      if (data) {
        setTenant(data);
        loadPayments(data.id, 1);
      }
    });
  }, [user, loadPayments, addToast]);

  const handlePageChange = (p: number) => {
    setPage(p);
    if (tenant) loadPayments(tenant.id, p);
  };

  const openReceipt = async (payment: Payment) => {
    setReceiptInvoiceSummary(null);
    const [invoiceResult, utilityPaymentResult] = await Promise.all([
      supabase.from('utility_invoices')
        .select('id, tenant_id, rent_month, rent_amount, rent_balance, water_amount, electricity_amount')
        .eq('tenant_id', payment.tenant_id)
        .eq('rent_month', payment.rent_month.slice(0, 10))
        .maybeSingle(),
      supabase.from('payments')
        .select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount')
        .eq('tenant_id', payment.tenant_id)
        .eq('rent_month', payment.rent_month.slice(0, 10)),
    ]);
    if (invoiceResult.error || utilityPaymentResult.error) {
      addToast(`Unable to load outstanding payment balance: ${invoiceResult.error?.message ?? utilityPaymentResult.error?.message}`, 'warning');
    } else if (invoiceResult.data) {
      const balance = calculateMonthlyInvoiceBalances([invoiceResult.data], utilityPaymentResult.data ?? [])
        .get(`${payment.tenant_id}:${payment.rent_month.slice(0, 7)}`);
      if (balance) {
        setReceiptInvoiceSummary({
          rentDue: Number(invoiceResult.data.rent_amount),
          waterDue: Number(invoiceResult.data.water_amount),
          electricityDue: Number(invoiceResult.data.electricity_amount),
          rentBalance: balance.rent_balance,
          rentCredit: balance.rent_credit,
          waterBalance: balance.water_balance,
          electricityBalance: balance.electricity_balance,
          totalBalance: balance.total_balance_due,
        });
      }
    }
    setReceipt(payment);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment History</h1>
        <p className="text-slate-500 text-sm mt-0.5">All your rent payment records</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Month</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-500">No payment records</td></tr>}
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{p.receipt_number}</p>
                    <p className="text-xs text-slate-500">{new Date(p.payment_date).toLocaleDateString('en-GB')}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-700">
                    {new Date(p.rent_month).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(p.amount_paid))}</span></p>
                    <p className="text-xs text-slate-500">{t('totalBalanceDue')}: <span className={`money-value font-semibold ${p.total_balance_due === undefined ? 'text-slate-400' : p.total_balance_due > 0 ? 'text-red-700' : 'text-slate-900'}`}>{p.total_balance_due === undefined ? '—' : fmt(p.total_balance_due)}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => openReceipt(p)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-5 py-3">
          <Pagination page={page} total={total} perPage={PER_PAGE} onChange={handlePageChange} />
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <Modal open={!!receipt} onClose={() => { setReceipt(null); setReceiptInvoiceSummary(null); }} title={t('paymentReceipt')} size="lg">
          <Receipt
            payment={receipt}
            invoiceRentDue={receiptInvoiceSummary?.rentDue}
            invoiceWaterDue={receiptInvoiceSummary?.waterDue}
            invoiceElectricityDue={receiptInvoiceSummary?.electricityDue}
            invoiceRentBalance={receiptInvoiceSummary?.rentBalance}
            invoiceRentCredit={receiptInvoiceSummary?.rentCredit}
            invoiceWaterBalance={receiptInvoiceSummary?.waterBalance}
            invoiceElectricityBalance={receiptInvoiceSummary?.electricityBalance}
            invoiceTotalBalance={receiptInvoiceSummary?.totalBalance}
          />
          <div className="flex justify-end gap-3 mt-4 no-print">
            <Button variant="ghost" onClick={() => { setReceipt(null); setReceiptInvoiceSummary(null); }}>Close</Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={() => printDocument('receipt', 'receipt-content')}>Print / Save PDF</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
