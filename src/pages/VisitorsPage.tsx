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
import { useTheme } from '@/contexts/ThemeContext';

const PER_PAGE = 15;

const emptyForm = {
  visitor_name: '', phone: '', national_id: '', house_id: '',
  tenant_id: '', purpose: '', vehicle_registration: '',
};

export default function VisitorsPage() {
  const { user, profile } = useAuth();
  const { t, language } = useTheme();
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
      addToast(t('visitorNamePurposeRequired'), 'error'); return;
    }
    if (profile?.role === 'property_manager' && !form.house_id) {
      addToast(t('selectAssignedHouse'), 'error'); return;
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
    else { addToast(t('visitorRegisteredSuccess'), 'success'); setModalOpen(false); setForm({ ...emptyForm }); load(); }
    setSaving(false);
  };

  const handleCheckOut = async (id: string) => {
    const { error } = await supabase.from('visitors').update({
      time_out: new Date().toISOString(), status: 'left',
    }).eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast(t('visitorCheckedOutSuccess'), 'success'); load(); }
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
    else { addToast(t('visitorUpdatedSuccess'), 'success'); setEditVisitor(null); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('visitors').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast(t('visitorDeletedSuccess'), 'success'); load(); }
    setDeleteId(null);
  };

  const insideCount = visitors.filter(v => v.status === 'inside').length;

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('visitorTitle')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <span className="text-emerald-400 font-semibold">{insideCount}</span> {t('visitorInsideCount')}
          </p>
        </div>
        <Button className="page-action-button" icon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ ...emptyForm }); setModalOpen(true); }}>
          {t('registerVisitorButton')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input placeholder={t('searchVisitorName')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
        <Select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          <option value="">{t('allVisitors')}</option>
          <option value="inside">{t('insideStatus')}</option>
          <option value="left">{t('leftStatus')}</option>
        </Select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="visitor-log-table w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('visitor')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{t('visiting')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{t('purposeLabel')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('timeIn')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('timeOut')}</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('status')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="text-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>}
              {!loading && visitors.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-500">{t('noVisitors')}</td></tr>}
              {visitors.map(v => (
                <tr key={v.id} className="visitor-log-row hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{v.visitor_name}</p>
                    <p className="text-xs text-slate-500">{v.phone ?? v.national_id ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-700">{(v.houses as any)?.house_number ?? '—'}</p>
                    <p className="text-xs text-slate-500">{(v.tenants as any)?.full_name ?? '—'}</p>
                  </td>
                  <td className="visitor-log-green-text px-5 py-3.5 hidden md:table-cell text-sm max-w-[160px] truncate">{v.purpose}</td>
                  <td className="visitor-log-green-text px-5 py-3.5 hidden lg:table-cell text-sm">
                    {new Date(v.time_in).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {v.time_out ? new Date(v.time_out).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`visitor-status-pill inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${
                      v.status === 'inside' ? 'bg-green-600 text-white border-green-700' : 'visitor-status-left bg-red-600 text-white border-red-700'
                    }`}>{v.status === 'inside' ? t('insideStatus') : t('leftStatus')}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewVisitor(v)}
                        title={t('viewDetails')}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditVisitor(v)}
                        title={t('edit')}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {v.status === 'inside' && (
                        <button onClick={() => handleCheckOut(v.id)}
                          className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                          title={t('checkOut')}>
                          <LogOut className="w-4 h-4" />
                        </button>
                      )}
                      {profile?.role === 'admin' && (
                        <button
                          onClick={() => setDeleteId(v.id)}
                          title={t('delete')}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('registerVisitorTitle')} size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('visitorNameLabel')} placeholder={t('fullNamePlaceholder')} value={form.visitor_name} onChange={set('visitor_name')} />
          <Input label={t('phoneNumber')} placeholder="+257 00 00 00 00" value={form.phone} onChange={set('phone')} />
          <Input label={t('nationalIdLabel')} placeholder={t('idNumberPlaceholder')} value={form.national_id} onChange={set('national_id')} />
          <Input label={t('vehicleRegistration')} placeholder="A 1234 A" value={form.vehicle_registration} onChange={set('vehicle_registration')} />
          <Select label={t('houseVisiting')} value={form.house_id} onChange={handleHouseChange}>
            <option value="">{t('selectHouse')}</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Select label={t('tenantBeingVisited')} value={form.tenant_id} onChange={set('tenant_id')}>
            <option value="">{t('chooseTenant')}</option>
            {filteredTenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <Input label={t('purposeOfVisit')} placeholder={t('visitPurposePlaceholder')} value={form.purpose} onChange={set('purpose')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button loading={saving} onClick={handleSave}>{t('registerVisitorButton')}</Button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewVisitor} onClose={() => setViewVisitor(null)} title={t('visitorDetailsTitle')} size="md">
        {viewVisitor && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-slate-400 text-xs uppercase">{t('nameLabel')}</p><p className="text-slate-900 font-medium">{viewVisitor.visitor_name}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('phoneNumber')}</p><p className="text-slate-900 font-medium">{viewVisitor.phone ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('nationalIdLabel')}</p><p className="text-slate-900 font-medium">{viewVisitor.national_id ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('vehicle')}</p><p className="text-slate-900 font-medium">{viewVisitor.vehicle_registration ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('house')}</p><p className="text-slate-900 font-medium">{(viewVisitor as any).houses?.house_number ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('tenant')}</p><p className="text-slate-900 font-medium">{(viewVisitor as any).tenants?.full_name ?? '—'}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('purposeLabel')}</p><p className="text-slate-900 font-medium">{viewVisitor.purpose}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('status')}</p><p className="text-slate-900 font-medium capitalize">{viewVisitor.status === 'inside' ? t('insideStatus') : t('leftStatus')}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('timeIn')}</p><p className="text-slate-900 font-medium">{new Date(viewVisitor.time_in).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')}</p></div>
              <div><p className="text-slate-400 text-xs uppercase">{t('timeOut')}</p><p className="text-slate-900 font-medium">{viewVisitor.time_out ? new Date(viewVisitor.time_out).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}</p></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editVisitor} onClose={() => setEditVisitor(null)} title={t('editVisitor')} size="md">
        {editVisitor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('visitorNameLabel')} value={editVisitor.visitor_name} onChange={e => setEditVisitor({ ...editVisitor, visitor_name: e.target.value })} />
            <Input label={t('phoneNumber')} value={editVisitor.phone ?? ''} onChange={e => setEditVisitor({ ...editVisitor, phone: e.target.value })} />
            <Input label={t('nationalIdLabel')} value={editVisitor.national_id ?? ''} onChange={e => setEditVisitor({ ...editVisitor, national_id: e.target.value })} />
            <Input label={t('vehicleRegistration')} value={editVisitor.vehicle_registration} onChange={e => setEditVisitor({ ...editVisitor, vehicle_registration: e.target.value })} />
            <div className="sm:col-span-2">
              <Input label={t('purposeOfVisit')} value={editVisitor.purpose} onChange={e => setEditVisitor({ ...editVisitor, purpose: e.target.value })} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setEditVisitor(null)}>{t('cancel')}</Button>
          <Button onClick={handleEditSave}>{t('update')}</Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('deleteVisitor')} size="sm">
        <p className="text-slate-500 text-sm mb-6">{t('deleteVisitorConfirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('delete')}</Button>
        </div>
      </Modal>
    </div>
  );
}
