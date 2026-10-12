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

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  pending: 'bg-amber-50 text-amber-700 border-amber-700/50',
  partial: 'bg-blue-50 text-blue-700 border-blue-700/50',
  overdue: 'bg-red-50 text-red-700 border-red-700/50',
};

const standardPaymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_deposit', label: 'Bank Deposit' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
] as const;

const emptyForm = {
  tenant_id: '', house_id: '', rent_month: '', payment_date: '',
  due_date: '', amount_due: '', amount_paid: '', late_fee: '0',
  payment_method: 'cash', status: 'paid', notes: '', payment_proof_url: '',
};

export default function PaymentsPage() {
  const { user } = useAuth();
  const { fmt } = useTheme();
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
    if (!error) { setPayments(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, search, filterStatus, filterMonth]);

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

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    const tenant = tenants.find(t => t.id === tid);
    setForm(f => ({
      ...f,
      tenant_id: tid,
      house_id: tenant?.house_id ?? '',
      amount_due: String(tenant?.monthly_rent ?? ''),
    }));
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
      due_date: (p as any).due_date ?? '',
      amount_due: String(p.amount_due),
      amount_paid: String(p.amount_paid),
      late_fee: String(p.late_fee ?? 0),
      payment_method: p.payment_method || 'cash',
      status: p.status,
      notes: (p as any).notes ?? '',
      payment_proof_url: (p as any).payment_proof_url ?? '',
    });
    setEditingId(p.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.tenant_id || !form.house_id || !form.rent_month || !form.amount_due) {
      addToast('Tenant, house, month and amount are required', 'error'); return;
    }
    setSaving(true);
    const amtPaid = Number(form.amount_paid) || 0;
    const amtDue = Number(form.amount_due);
    const computedStatus = amtPaid >= amtDue ? 'paid' : amtPaid > 0 ? 'partial' : 'pending';
    const finalStatus = form.status === 'overdue' ? 'overdue' : computedStatus;

    const paymentMethod = form.payment_method.trim() || 'cash';

    const payload: any = {
      tenant_id: form.tenant_id, house_id: form.house_id,
      rent_month: form.rent_month + '-01',
      payment_date: form.payment_date || new Date().toISOString().slice(0, 10),
      due_date: form.due_date || new Date().toISOString().slice(0, 10),
      amount_due: amtDue, amount_paid: amtPaid,
      late_fee: Number(form.late_fee) || 0,
      payment_method: paymentMethod,
      payment_proof_url: form.payment_proof_url || null,
      status: finalStatus,
      notes: form.notes || null,
    };

    if (editingId) {
      const { error } = await supabase.from('payments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { addToast(error.message, 'error'); }
      else { addToast('Payment updated', 'success'); setModalOpen(false); load(); }
    } else {
      payload.recorded_by = user?.id;
      const { error } = await supabase.from('payments').insert(payload);
      if (error) { addToast(error.message, 'error'); }
      else { addToast('Payment recorded', 'success'); setModalOpen(false); setForm({ ...emptyForm }); load(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('payments').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast('Payment deleted', 'success'); load(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Receipt print modal */}
      {receiptPayment && (
        <Modal open={!!receiptPayment} onClose={() => setReceiptPayment(null)} title="Payment Receipt" size="md">
          <Receipt payment={receiptPayment} />
          <div className="flex justify-end gap-3 mt-4 no-print">
            <Button variant="ghost" onClick={() => setReceiptPayment(null)}>Close</Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={() => printDocument('receipt', 'receipt-content')}>Print / Save PDF</Button>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rent Payments</h1>
          <p className="text-slate-500 text-sm mt-0.5">Record and track all rent transactions</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
          Record Payment
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap no-print">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search receipt number..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
        </select>
        <input type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Tenant</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Month</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && payments.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No payments found</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{p.receipt_number}</p>
                    <p className="text-xs text-slate-500">{new Date(p.payment_date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-900">{(p.tenants as any)?.full_name}</p>
                    <p className="text-xs text-slate-500">{(p.houses as any)?.house_number}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-700">
                    {new Date(p.rent_month).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(p.amount_paid))}</span></p>
                    <p className="text-xs text-slate-500">of <span className="money-value">{fmt(Number(p.amount_due))}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setReceiptPayment(p)}
                        title="View receipt"
                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        title="Edit payment"
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        title="Delete payment"
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Payment' : 'Record Payment'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Tenant" value={form.tenant_id} onChange={handleTenantChange}>
            <option value="">Select tenant</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.tenant_code})</option>)}
          </Select>
          <Select label="House" value={form.house_id} onChange={set('house_id')}>
            <option value="">Select house</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Input label="Rent Month" type="month" value={form.rent_month} onChange={set('rent_month')} />
          <Input label="Payment Date" type="date" value={form.payment_date} onChange={set('payment_date')} />
          <Input label="Amount Due" type="number" value={form.amount_due} onChange={set('amount_due')} />
          <Input label="Amount Paid" type="number" value={form.amount_paid} onChange={set('amount_paid')} />
          <Input label="Late Fee" type="number" value={form.late_fee} onChange={set('late_fee')} />
          <Select label="Payment Method" value={form.payment_method} onChange={set('payment_method')}>
            {standardPaymentMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
            {customPaymentMethods.map(method => (
              <option key={method.id} value={method.name}>{method.name}</option>
            ))}
            {form.payment_method && !standardPaymentMethods.some(method => method.value === form.payment_method) &&
              !customPaymentMethods.some(method => method.name === form.payment_method) && (
                <option value={form.payment_method}>{form.payment_method}</option>
              )}
          </Select>
          <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={2} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? 'Update' : 'Save'}</Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Payment" size="sm">
        <p className="text-slate-500 text-sm mb-6">This action cannot be undone. The receipt will be permanently removed.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
