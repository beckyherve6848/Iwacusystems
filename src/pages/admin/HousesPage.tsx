import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Home, Building2, ImageOff } from 'lucide-react';
import { supabase, House, Property } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useTheme } from '@/contexts/ThemeContext';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  vacant: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  occupied: 'bg-blue-50 text-blue-700 border-blue-700/50',
  reserved: 'bg-amber-50 text-amber-700 border-amber-700/50',
  maintenance: 'bg-red-50 text-red-700 border-red-700/50',
};

const emptyForm = {
  house_number: '', property_id: '', block_wing: '', floor: '', category_id: '',
  monthly_rent: '', security_deposit: '', description: '', status: 'vacant', image_url: '',
};

export default function HousesPage({ managerMode = false }: { managerMode?: boolean }) {
  const [houses, setHouses] = useState<House[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [savingProperty, setSavingProperty] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const { fmt } = useTheme();

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('houses')
      .select('*, house_categories(name), properties(id, name)', { count: 'exact' })
      .order('house_number');

    if (search) q = q.ilike('house_number', `%${search}%`);
    if (filterStatus) q = q.eq('status', filterStatus);

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (!error) { setHouses(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, search, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from('house_categories').select('id, name').then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    supabase.from('properties').select('id, name, address').order('name')
      .then(({ data, error }) => {
        if (error) addToast(`Unable to load properties: ${error.message}`, 'error');
        else setProperties(data ?? []);
      });
  }, [addToast]);

  const openAdd = () => { setForm({ ...emptyForm }); setEditingId(null); setModalOpen(true); };
  const openEdit = (h: House) => {
    setForm({
      house_number: h.house_number,
      property_id: h.property_id ?? '',
      block_wing: h.block_wing ?? '',
      floor: h.floor ?? '',
      category_id: h.category_id ?? '',
      monthly_rent: String(h.monthly_rent),
      security_deposit: String(h.security_deposit),
      description: h.description ?? '',
      status: h.status,
      image_url: h.image_url ?? '',
    });
    setEditingId(h.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.house_number.trim()) { addToast('House number is required', 'error'); return; }
    if (!form.property_id) { addToast('Select the property this house belongs to.', 'error'); return; }
    setSaving(true);
    const payload = {
      house_number: form.house_number.trim(),
      property_id: form.property_id,
      block_wing: form.block_wing || null,
      floor: form.floor || null,
      category_id: form.category_id || null,
      monthly_rent: Number(form.monthly_rent) || 0,
      security_deposit: Number(form.security_deposit) || 0,
      description: form.description || null,
      status: form.status,
      image_url: form.image_url || null,
    };
    const { error } = editingId
      ? await supabase.from('houses').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('houses').insert(payload);
    if (error) { addToast(error.message, 'error'); }
    else { addToast(editingId ? 'House updated' : 'House added', 'success'); setModalOpen(false); load(); }
    setSaving(false);
  };

  const handleCreateProperty = async () => {
    if (!propertyName.trim()) {
      addToast('Property name is required.', 'error');
      return;
    }
    setSavingProperty(true);
    const { data, error } = await supabase.from('properties')
      .insert({ name: propertyName.trim(), address: propertyAddress.trim() || null })
      .select('id, name, address')
      .single();
    if (error) {
      addToast(`Unable to create property: ${error.message}`, 'error');
    } else {
      setProperties(current => [...current, data].sort((left, right) => left.name.localeCompare(right.name)));
      setForm(current => ({ ...current, property_id: data.id }));
      setPropertyName('');
      setPropertyAddress('');
      setPropertyModalOpen(false);
      addToast('Property created. Now add houses to it.', 'success');
    }
    setSavingProperty(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('houses').delete().eq('id', deleteId);
    if (error) addToast('Cannot delete: house may have active tenants or payments', 'error');
    else { addToast('House deleted', 'success'); load(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Properties &amp; Houses</h1>
          <p className="text-slate-500 text-sm mt-0.5">Create properties first, then add their rental houses.</p>
        </div>
        {!managerMode && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Building2 className="w-4 h-4" />} onClick={() => setPropertyModalOpen(true)}>Add Property</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add House</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search house number..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">All Statuses</option>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="reserved">Reserved</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">House</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Floor/Block</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rent</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && houses.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No houses found</td></tr>
              )}
              {houses.map(h => (
                <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {h.image_url
                          ? <img src={h.image_url} alt="" className="w-full h-full object-cover" />
                          : <Home className="w-4 h-4 text-slate-500" />
                        }
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{h.house_number}</p>
                        <p className="text-xs text-slate-500">{(h.house_categories as any)?.name ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-700">
                    {h.properties?.name ?? 'Unassigned'}
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-700">
                    {(h.house_categories as any)?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {[h.floor && `Floor ${h.floor}`, h.block_wing].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(h.monthly_rent))}</span></p>
                    <p className="text-xs text-slate-500">Dep: <span className="money-value">{fmt(Number(h.security_deposit))}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[h.status]}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(h)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!managerMode && (
                        <button onClick={() => setDeleteId(h.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
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

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit House' : 'Add House'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="House Number *" placeholder="e.g. A-101" value={form.house_number} onChange={set('house_number')} />
          <Select label="Property *" value={form.property_id} onChange={set('property_id')}>
            <option value="">Select property</option>
            {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
          </Select>
          {properties.length === 0 && !managerMode && (
            <p className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Create a Property first, then add houses under it.
            </p>
          )}
          <Input label="Block / Wing" placeholder="e.g. Block A" value={form.block_wing} onChange={set('block_wing')} />
          <Input label="Floor" placeholder="e.g. Ground, 1st" value={form.floor} onChange={set('floor')} />
          <Select label="Category" value={form.category_id} onChange={set('category_id')}>
            <option value="">Select category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Monthly Rent (Fbu)" type="number" placeholder="0" value={form.monthly_rent} onChange={set('monthly_rent')} />
          <Input label="Security Deposit (Fbu)" type="number" placeholder="0" value={form.security_deposit} onChange={set('security_deposit')} />
          <Select label="Status" value={form.status} onChange={set('status')}>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="maintenance">Maintenance</option>
          </Select>
          <Input label="Image URL" placeholder="https://..." value={form.image_url} onChange={set('image_url')} />
          <div className="sm:col-span-2">
            <Textarea label="Description" placeholder="Describe the unit..." value={form.description} onChange={set('description')} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? 'Save Changes' : 'Add House'}</Button>
        </div>
      </Modal>

      <Modal open={propertyModalOpen} onClose={() => setPropertyModalOpen(false)} title="Add Property" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">A property is the building or location that contains one or more rental houses.</p>
          <Input label="Property name *" placeholder="e.g. Mirango" value={propertyName} onChange={event => setPropertyName(event.target.value)} />
          <Input label="Property address (optional)" placeholder="e.g. Mirango, Bujumbura" value={propertyAddress} onChange={event => setPropertyAddress(event.target.value)} />
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => setPropertyModalOpen(false)}>Cancel</Button>
            <Button loading={savingProperty} onClick={handleCreateProperty}>Create Property</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete House" size="sm">
        <p className="text-slate-700 mb-6">Are you sure you want to delete this house? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
