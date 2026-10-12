import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, LogOut, Eye, Pencil, Trash2 } from 'lucide-react';
import { supabase, Visitor } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useAuth } from '@/contexts/AuthContext';

const PER_PAGE = 15;

const emptyForm = {
  visitor_name: '', phone: '', national_id: '', house_id: '',
  tenant_id: '', purpose: '', vehicle_registration: '',
};

export default function VisitorsPage() {
  const { user, profile } = useAuth();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [houses, setHouses] = useState<{ id: string; house_number: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: string; full_name: string; house_id?: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [viewVisitor, setViewVisitor] = useState<Visitor | null>(null);
  const [editVisitor, setEditVisitor] = useState<Visitor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('visitors')
      .select('*, houses(house_number), tenants(full_name)', { count: 'exact' })
      .order('time_in', { ascending: false });

    if (search) q = q.ilike('visitor_name', `%${search}%`);
    if (filterStatus) q = q.eq('status', filterStatus);

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (!error) { setVisitors(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, search, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from('houses').select('id, house_number').then(({ data }) => setHouses(data ?? []));
    supabase.from('tenants').select('id, full_name, house_id').eq('status', 'active').then(({ data }) => setTenants(data ?? []));
  }, []);

  const handleHouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const hid = e.target.value;
    setForm(f => ({ ...f, house_id: hid, tenant_id: '' }));
  };

  const filteredTenants = form.house_id ? tenants.filter(t => t.house_id === form.house_id) : tenants;

  const handleSave = async () => {
    if (!form.visitor_name.trim() || !form.purpose.trim()) {
      addToast('Visitor name and purpose are required', 'error'); return;
    }
    if (profile?.role === 'property_manager' && !form.house_id) {
      addToast('Select an assigned house for this visitor', 'error'); return;
    }
    setSaving(true);
    const payload = {
      visitor_name: form.visitor_name.trim(),
      phone: form.phone || null,
      national_id: form.national_id || null,
      house_id: form.house_id || null,
      tenant_id: form.tenant_id || null,
      purpose: form.purpose.trim(),
      vehicle_registration: form.vehicle_registration || null,
      time_in: new Date().toISOString(),
      status: 'inside',
      registered_by: user?.id,
    };
    const { error } = await supabase.from('visitors').insert(payload);
    if (error) addToast(error.message, 'error');
    else { addToast('Visitor registered', 'success'); setModalOpen(false); setForm({ ...emptyForm }); load(); }
    setSaving(false);
  };

  const handleCheckOut = async (id: string) => {
    const { error } = await supabase.from('visitors').update({
      time_out: new Date().toISOString(), status: 'left',
    }).eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Visitor checked out', 'success'); load(); }
  };

  const handleEditSave = async () => {
    if (!editVisitor) return;
    const { error } = await supabase.from('visitors').update({
      visitor_name: editVisitor.visitor_name.trim(),
      phone: editVisitor.phone || null,
      national_id: editVisitor.national_id || null,
      purpose: editVisitor.purpose.trim(),
      vehicle_registration: editVisitor.vehicle_registration || null,
    }).eq('id', editVisitor.id);
    if (error) addToast(error.message, 'error');
    else { addToast('Visitor updated', 'success'); setEditVisitor(null); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('visitors').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast('Visitor deleted', 'success'); load(); }
    setDeleteId(null);
  };

  const insideCount = visitors.filter(v => v.status === 'inside').length;

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visitors</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <span className="text-emerald-400 font-semibold">{insideCount}</span> currently inside
          </p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ ...emptyForm }); setModalOpen(true); }}>
          Register Visitor
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input placeholder="Search visitor name..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">All Visitors</option>
          <option value="inside">Inside</option>
          <option value="left">Left</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Visitor</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Visiting</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Purpose</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Time In</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Time Out</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="text-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>}
              {!loading && visitors.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-500">No visitors found</td></tr>}
              {visitors.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{v.visitor_name}</p>
                    <p className="text-xs text-slate-500">{v.phone ?? v.national_id ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-700">{(v.houses as any)?.house_number ?? '—'}</p>
                    <p className="text-xs text-slate-500">{(v.tenants as any)?.full_name ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-500 max-w-[160px] truncate">{v.purpose}</td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {new Date(v.time_in).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {v.time_out ? new Date(v.time_out).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${
                      v.status === 'inside' ? 'bg-green-50 text-green-700 border-green-700/50' : 'bg-slate-100/50 text-slate-500 border-slate-600/50'
                    }`}>{v.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewVisitor(v)}
                        title="View"
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditVisitor(v)}
                        title="Edit"
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {v.status === 'inside' && (
                        <button onClick={() => handleCheckOut(v.id)}
                          className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                          title="Check out">
                          <LogOut className="w-4 h-4" />
                        </button>
                      )}
                      {profile?.role === 'admin' && (
                        <button
                          onClick={() => setDeleteId(v.id)}
                          title="Delete"
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register Visitor" size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Visitor Name *" placeholder="Full name" value={form.visitor_name} onChange={set('visitor_name')} />
          <Input label="Phone Number" placeholder="+254 700 000 000" value={form.phone} onChange={set('phone')} />
          <Input label="National ID" placeholder="ID number" value={form.national_id} onChange={set('national_id')} />
          <Input label="Vehicle Registration" placeholder="KAA 123X" value={form.vehicle_registration} onChange={set('vehicle_registration')} />
          <Select label="House Visiting" value={form.house_id} onChange={handleHouseChange}>
            <option value="">Select house</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Select label="Tenant Being Visited" value={form.tenant_id} onChange={set('tenant_id')}>
            <option value="">Select tenant</option>
            {filteredTenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <Input label="Purpose of Visit *" placeholder="e.g. Family visit, Delivery, Meeting" value={form.purpose} onChange={set('purpose')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Register Visitor</Button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewVisitor} onClose={() => setViewVisitor(null)} title="Visitor Details" size="md">
        {viewVisitor && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-slate-400 text-xs uppercase">Name</p><p className="text-slate-900 font-medium">{viewVisitor.visitor_name}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Phone</p><p className="text-slate-900 font-medium">{viewVisitor.phone ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">National ID</p><p className="text-slate-900 font-medium">{viewVisitor.national_id ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Vehicle</p><p className="text-slate-900 font-medium">{viewVisitor.vehicle_registration ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">House</p><p className="text-slate-900 font-medium">{(viewVisitor as any).houses?.house_number ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Tenant</p><p className="text-slate-900 font-medium">{(viewVisitor as any).tenants?.full_name ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Purpose</p><p className="text-slate-900 font-medium">{viewVisitor.purpose}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Status</p><p className="text-slate-900 font-medium capitalize">{viewVisitor.status}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Time In</p><p className="text-slate-900 font-medium">{new Date(viewVisitor.time_in).toLocaleString()}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">Time Out</p><p className="text-slate-900 font-medium">{viewVisitor.time_out ? new Date(viewVisitor.time_out).toLocaleString() : '—'}</p></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editVisitor} onClose={() => setEditVisitor(null)} title="Edit Visitor" size="md">
        {editVisitor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Visitor Name *" value={editVisitor.visitor_name} onChange={e => setEditVisitor({ ...editVisitor, visitor_name: e.target.value })} />
            <Input label="Phone Number" value={editVisitor.phone ?? ''} onChange={e => setEditVisitor({ ...editVisitor, phone: e.target.value })} />
            <Input label="National ID" value={editVisitor.national_id ?? ''} onChange={e => setEditVisitor({ ...editVisitor, national_id: e.target.value })} />
            <Input label="Vehicle Registration" value={editVisitor.vehicle_registration ?? ''} onChange={e => setEditVisitor({ ...editVisitor, vehicle_registration: e.target.value })} />
            <div className="sm:col-span-2">
              <Input label="Purpose of Visit *" value={editVisitor.purpose} onChange={e => setEditVisitor({ ...editVisitor, purpose: e.target.value })} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setEditVisitor(null)}>Cancel</Button>
          <Button onClick={handleEditSave}>Update</Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Visitor" size="sm">
        <p className="text-slate-500 text-sm mb-6">This action cannot be undone. The visitor record will be permanently removed.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
