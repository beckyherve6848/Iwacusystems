import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Eye, Printer } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import Receipt, { ReceiptData } from '@/components/Receipt';
import { printDocument } from '@/lib/print';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  pending: 'bg-amber-50 text-amber-700 border-amber-700/50',
  partial: 'bg-blue-50 text-blue-700 border-blue-700/50',
  overdue: 'bg-red-50 text-red-700 border-red-700/50',
};

export default function TenantPaymentsPage() {
  const { user } = useAuth();
  const { fmt } = useTheme();
  const [tenant, setTenant] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('tenants').select('id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setTenant(data);
        loadPayments(data.id, 1);
      }
    });
  }, [user]);

  const loadPayments = async (tenantId: string, p: number) => {
    const from = (p - 1) * PER_PAGE;
    const { data, count } = await supabase
      .from('payments')
      .select('*, tenants(full_name, tenant_code), houses(house_number)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, from + PER_PAGE - 1);
    setPayments(data ?? []);
    setTotal(count ?? 0);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    if (tenant) loadPayments(tenant.id, p);
  };

  return (
    <div className="space-y-6">
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
                    <p className="text-xs text-slate-500">{new Date(p.payment_date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-700">
                    {new Date(p.rent_month).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(p.amount_paid))}</span></p>
                    <p className="text-xs text-slate-500">Due: <span className="money-value">{fmt(Number(p.amount_due))}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setReceipt(p)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
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
        <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Payment Receipt" size="md">
          <Receipt payment={receipt} />
          <div className="flex justify-end gap-3 mt-4 no-print">
            <Button variant="ghost" onClick={() => setReceipt(null)}>Close</Button>
            <Button icon={<Printer className="w-4 h-4" />} onClick={() => printDocument('receipt', 'receipt-content')}>Print / Save PDF</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
