import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Eye, Printer, Pencil, Trash2 } from 'lucide-react';
import { supabase, Payment } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import Receipt from '@/components/Receipt';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { printDocument } from '@/lib/print';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';
import { calculateMonthlyInvoiceBalances } from '@/lib/invoiceBalances';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  pending: 'bg-amber-50 text-amber-700 border-amber-700/50',
  partial: 'bg-blue-50 text-blue-700 border-blue-700/50',
  overdue: 'bg-red-50 text-red-700 border-red-700/50',
};

const standardPaymentMethods = [
  { value: 'cash', labelKey: 'cashPayment' },
  { value: 'bank_deposit', labelKey: 'bankDepositPayment' },
  { value: 'bank_transfer', labelKey: 'bankTransferPayment' },
  { value: 'mobile_money', labelKey: 'mobileMoneyPayment' },
] as const;

const emptyForm = {
  tenant_id: '', house_id: '', rent_month: '', payment_date: '',
  due_date: '', amount_due: '', rent_paid_amount: '',
  water_due_amount: '0', electricity_due_amount: '0',
  water_paid_amount: '0', electricity_paid_amount: '0', late_fee: '0',
  payment_method: 'cash', status: 'paid', notes: '', payment_proof_url: '',
};

export default function PaymentsPage() {
  const { user, profile } = useAuth();
  const { fmt, t, language } = useTheme();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenants, setTenants] = useState<{ id: string; full_name: string; tenant_code: string; house_id?: string; monthly_rent?: number }[]>([]);
  const [houses, setHouses] = useState<{ id: string; house_number: string; monthly_rent: number }[]>([]);
  const [customPaymentMethods, setCustomPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('payments')
      .select('*, tenants(full_name, tenant_code), houses(house_number)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) q = q.or(`receipt_number.ilike.%${search}%`);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (filterMonth) {
      const [y, m] = filterMonth.split('-').map(Number);
      const nextMonth = new Date(y, m, 1).toISOString().slice(0, 10);
      q = q.gte('rent_month', filterMonth + '-01').lt('rent_month', nextMonth);
    }

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (error) {
      addToast(`Unable to load payments: ${error.message}`, 'error');
      setPayments([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const tenantIds = [...new Set(rows.map(payment => payment.tenant_id))];
    const rentMonths = [...new Set(rows.map(payment => payment.rent_month.slice(0, 10)))];
    if (tenantIds.length > 0 && rentMonths.length > 0) {
      const [invoiceResult, utilityPaymentResult] = await Promise.all([
        supabase.from('utility_invoices')
          .select('id, tenant_id, rent_month, rent_amount, rent_balance, water_amount, electricity_amount')
          .in('tenant_id', tenantIds)
          .in('rent_month', rentMonths),
        supabase.from('payments')
          .select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount')
          .in('tenant_id', tenantIds)
          .in('rent_month', rentMonths),
      ]);
      if (invoiceResult.error || utilityPaymentResult.error) {
        const message = invoiceResult.error?.message ?? utilityPaymentResult.error?.message;
        addToast(`Unable to load outstanding payment balances: ${message}`, 'error');
        setPayments(rows);
      } else {
        const monthlyBalances = calculateMonthlyInvoiceBalances(invoiceResult.data ?? [], utilityPaymentResult.data ?? []);
        setPayments(rows.map(payment => ({
          ...payment,
          total_balance_due: monthlyBalances.get(`${payment.tenant_id}:${payment.rent_month.slice(0, 7)}`)?.total_balance_due,
        })));
      }
    } else {
      setPayments([]);
    }
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, filterStatus, filterMonth, addToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from('tenants').select('id, full_name, tenant_code, house_id, monthly_rent').eq('status', 'active')
      .then(({ data }) => setTenants(data ?? []));
    supabase.from('houses').select('id, house_number, monthly_rent')
      .then(({ data }) => setHouses(data ?? []));
    supabase.from('settings').select('value').eq('key', 'custom_payment_methods').maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          addToast(`Unable to load custom payment methods: ${error.message}`, 'error');
          return;
        }
        try {
          setCustomPaymentMethods(parseCustomPaymentMethods(data?.value));
        } catch (parseError) {
          addToast(`Unable to load custom payment methods: ${parseError instanceof Error ? parseError.message : String(parseError)}`, 'error');
        }
      });
  }, [addToast]);

  const loadInvoiceCharges = async (tenantId: string, rentMonth: string) => {
    const tenant = tenants.find(item => item.id === tenantId);
    if (!tenantId || !rentMonth) {
      setForm(current => ({ ...current, amount_due: String(tenant?.monthly_rent ?? '') }));
      return;
    }
    const { data, error } = await supabase
      .from('utility_invoices')
      .select('rent_amount, water_amount, electricity_amount')
      .eq('tenant_id', tenantId)
      .eq('rent_month', `${rentMonth}-01`)
      .maybeSingle();
    if (error) {
      addToast(`Unable to load invoice charges: ${error.message}`, 'error');
      return;
    }
    setForm(f => ({
      ...f,
      amount_due: String(data?.rent_amount ?? tenant?.monthly_rent ?? ''),
      water_due_amount: String(data?.water_amount ?? 0),
      electricity_due_amount: String(data?.electricity_amount ?? 0),
    }));
  };

  const handleTenantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tenantId = e.target.value;
    const tenant = tenants.find(item => item.id === tenantId);
    setForm(current => ({
      ...current,
      tenant_id: tenantId,
      house_id: tenant?.house_id ?? '',
      amount_due: String(tenant?.monthly_rent ?? ''),
      rent_paid_amount: '',
      water_paid_amount: '0',
      electricity_paid_amount: '0',
    }));
    await loadInvoiceCharges(tenantId, form.rent_month);
  };

  const handleRentMonthChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rentMonth = e.target.value;
    setForm(current => ({ ...current, rent_month: rentMonth }));
    await loadInvoiceCharges(form.tenant_id, rentMonth);
  };

  const openAdd = () => {
    setForm({ ...emptyForm, rent_month: new Date().toISOString().slice(0, 7) });
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (p: Payment) => {
    setForm({
      tenant_id: p.tenant_id,
      house_id: p.house_id,
      rent_month: p.rent_month.slice(0, 7),
      payment_date: p.payment_date,
      due_date: p.due_date ?? '',
      amount_due: String(p.amount_due),
      rent_paid_amount: String(p.rent_paid_amount ?? p.amount_paid),
      water_due_amount: String(p.water_due_amount ?? 0),
      electricity_due_amount: String(p.electricity_due_amount ?? 0),
      water_paid_amount: String(p.water_paid_amount ?? 0),
      electricity_paid_amount: String(p.electricity_paid_amount ?? 0),
      late_fee: String(p.late_fee ?? 0),
      payment_method: p.payment_method || 'cash',
      status: p.status,
      notes: p.notes ?? '',
      payment_proof_url: p.payment_proof_url ?? '',
    });
    setEditingId(p.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.tenant_id || !form.house_id || !form.rent_month || !form.amount_due) {
      addToast(t('paymentRequiredFields'), 'error'); return;
    }
    setSaving(true);
    const rentPaid = Number(form.rent_paid_amount);
    const waterPaid = Number(form.water_paid_amount);
    const electricityPaid = Number(form.electricity_paid_amount);
    const amtDue = Number(form.amount_due);
    const waterDue = Number(form.water_due_amount);
    const electricityDue = Number(form.electricity_due_amount);
    if (![rentPaid, waterPaid, electricityPaid, amtDue, waterDue, electricityDue].every(amount => Number.isFinite(amount) && amount >= 0)) {
      addToast(t('paymentAmountValid'), 'error');
      setSaving(false);
      return;
    }
    const totalPaid = rentPaid + waterPaid + electricityPaid;
    const computedStatus = rentPaid >= amtDue ? 'paid' : rentPaid > 0 ? 'partial' : 'pending';
    const finalStatus = form.status === 'overdue' ? 'overdue' : computedStatus;

    const paymentMethod = form.payment_method.trim() || 'cash';

    const payload = {
      tenant_id: form.tenant_id, house_id: form.house_id,
      rent_month: form.rent_month + '-01',
      payment_date: form.payment_date || new Date().toISOString().slice(0, 10),
      due_date: form.due_date || new Date().toISOString().slice(0, 10),
      amount_due: amtDue, amount_paid: totalPaid,
      rent_paid_amount: rentPaid,
      water_due_amount: waterDue,
      electricity_due_amount: electricityDue,
      water_paid_amount: waterPaid,
      electricity_paid_amount: electricityPaid,
      late_fee: Number(form.late_fee) || 0,
      payment_method: paymentMethod,
      payment_proof_url: form.payment_proof_url || null,
      status: finalStatus,
      notes: form.notes || null,
    };

    if (editingId) {
      const { error } = await supabase.from('payments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { addToast(error.message, 'error'); }
      else { addToast(t('paymentUpdatedSuccess'), 'success'); setModalOpen(false); load(); }
    } else {
      const { error } = await supabase.from('payments').insert({
        ...payload,
        recorded_by: user?.id,
        recorded_by_name: profile?.full_name ?? null,
        recorded_by_phone: profile?.role === 'property_manager' ? profile.phone ?? null : null,
      });
      if (error) { addToast(error.message, 'error'); }
      else { addToast(t('paymentRecordedSuccess'), 'success'); setModalOpen(false); setForm({ ...emptyForm }); load(); }
    }
    setSaving(false);
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
    setReceiptPayment(payment);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('payments').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast(t('paymentDeletedSuccess'), 'success'); load(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Receipt print modal */}
      {receiptPayment && (
        <Modal open={!!receiptPayment} onClose={() => { setReceiptPayment(null); setReceiptInvoiceSummary(null); }} title={t('paymentReceipt')} size="lg">
          <Receipt
            payment={receiptPayment}
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
            <Button variant="ghost" onClick={() => { setReceiptPayment(null); setReceiptInvoiceSummary(null); }}>{t('closeButton')}</Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={() => printDocument('receipt', 'receipt-content')}>{t('printSavePdf')}</Button>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('rentPaymentsTitle')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('trackRentTransactions')}</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
          {t('recordPayment')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap no-print">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder={t('searchReceiptNumber')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <Select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">{t('allPaymentStatuses')}</option>
          <option value="paid">{t('paid')}</option>
          <option value="pending">{t('pending')}</option>
          <option value="partial">{t('partial')}</option>
          <option value="overdue">{t('overdue')}</option>
        </Select>
        <input type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('paymentReceiptHeader')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{t('tenant')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('rentMonth')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('paymentAmount')}</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('status')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && payments.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">{t('noPaymentsFound')}</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{p.receipt_number}</p>
                    <p className="text-xs text-slate-500">{new Date(p.payment_date).toLocaleDateString('en-GB')}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-900">{p.tenants?.full_name}</p>
                    <p className="text-xs text-slate-500">{p.houses?.house_number}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-700">
                    {new Date(p.rent_month).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(p.amount_paid))}</span></p>
                    <p className="text-xs text-slate-500">{t('totalBalanceDue')}: <span className={`money-value font-semibold ${p.total_balance_due === undefined ? 'text-slate-400' : p.total_balance_due > 0 ? 'text-red-700' : 'text-slate-900'}`}>{p.total_balance_due === undefined ? '—' : fmt(p.total_balance_due)}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[p.status]}`}>
                      {t(p.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openReceipt(p)}
                        title={t('viewReceipt')}
                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        title={t('editPayment')}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        title={t('deletePayment')}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-5 py-3">
          <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('editPaymentTitle') : t('recordPayment')} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label={t('tenant')} value={form.tenant_id} onChange={handleTenantChange}>
            <option value="">{t('chooseTenant')}</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.tenant_code})</option>)}
          </Select>
          <Select label={t('house')} value={form.house_id} onChange={set('house_id')}>
            <option value="">{t('selectHouse')}</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Input label={t('rentMonth')} type="month" value={form.rent_month} onChange={handleRentMonthChange} />
          <Input label={t('paymentDateLabel')} type="date" value={form.payment_date} onChange={set('payment_date')} />
          <Input label={t('rentDue')} type="number" min="0" step="0.01" value={form.amount_due} onChange={set('amount_due')} />
          <Input label={t('rentPaid')} type="number" min="0" step="0.01" value={form.rent_paid_amount} onChange={set('rent_paid_amount')} />
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('additionalCharges')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={`${t('water')} ${t('chargeDue')}`} type="number" value={form.water_due_amount} readOnly />
              <Input label={`${t('water')} ${t('paidAmount')}`} type="number" min="0" step="0.01" value={form.water_paid_amount} onChange={set('water_paid_amount')} />
              <Input label={`${t('electricity')} ${t('chargeDue')}`} type="number" value={form.electricity_due_amount} readOnly />
              <Input label={`${t('electricity')} ${t('paidAmount')}`} type="number" min="0" step="0.01" value={form.electricity_paid_amount} onChange={set('electricity_paid_amount')} />
            </div>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
            <span className="text-sm font-semibold text-emerald-900">{t('totalPaymentReceived')}</span>
            <span className="text-lg font-bold text-emerald-900 money-value">
              {fmt((Number(form.rent_paid_amount) || 0) + (Number(form.water_paid_amount) || 0) + (Number(form.electricity_paid_amount) || 0))}
            </span>
          </div>
          <Input label={t('paymentLateFee')} type="number" value={form.late_fee} onChange={set('late_fee')} />
          <Select label={t('paymentMethodLabel')} value={form.payment_method} onChange={set('payment_method')}>
            {standardPaymentMethods.map(method => <option key={method.value} value={method.value}>{t(method.labelKey)}</option>)}
            {customPaymentMethods.map(method => (
              <option key={method.id} value={method.name}>{method.name}</option>
            ))}
            {form.payment_method && !standardPaymentMethods.some(method => method.value === form.payment_method) &&
              !customPaymentMethods.some(method => method.name === form.payment_method) && (
                <option value={form.payment_method}>{form.payment_method}</option>
              )}
          </Select>
          <Textarea label={t('notesLabel')} value={form.notes} onChange={set('notes')} rows={2} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? t('update') : t('save')}</Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('deletePaymentTitle')} size="sm">
        <p className="text-slate-500 text-sm mb-6">{t('deletePaymentConfirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('delete')}</Button>
        </div>
      </Modal>
    </div>
  );
}
