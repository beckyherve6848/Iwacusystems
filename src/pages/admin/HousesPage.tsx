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
  const { fmt, t, language } = useTheme();
  const text = (english: string, french: string) => language === 'fr' ? french : english;
  const houseStatus = (status: string) => ({
    vacant: text('Vacant', 'Libre'),
    occupied: text('Occupied', 'Occupée'),
    reserved: text('Reserved', 'Réservée'),
    maintenance: text('Maintenance', 'En maintenance'),
  }[status] ?? status);

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
        if (error) addToast(`${language === 'fr' ? 'Impossible de charger les biens immobiliers' : 'Unable to load properties'}: ${error.message}`, 'error');
        else setProperties(data ?? []);
      });
  }, [addToast, language]);

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
    if (!form.house_number.trim()) { addToast(text('House number is required', 'Le numéro de maison est obligatoire.'), 'error'); return; }
    if (!form.property_id) { addToast(text('Select the property this house belongs to.', 'Sélectionnez le bien immobilier auquel appartient cette maison.'), 'error'); return; }
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
    else { addToast(editingId ? text('House updated', 'Maison mise à jour') : text('House added', 'Maison ajoutée'), 'success'); setModalOpen(false); load(); }
    setSaving(false);
  };

  const handleCreateProperty = async () => {
    if (!propertyName.trim()) {
      addToast(text('Property name is required.', 'Le nom du bien immobilier est obligatoire.'), 'error');
      return;
    }
    setSavingProperty(true);
    const { data, error } = await supabase.from('properties')
      .insert({ name: propertyName.trim(), address: propertyAddress.trim() || null })
      .select('id, name, address')
      .single();
    if (error) {
      addToast(`${text('Unable to create property', 'Impossible de créer le bien immobilier')}: ${error.message}`, 'error');
    } else {
      setProperties(current => [...current, data].sort((left, right) => left.name.localeCompare(right.name)));
      setForm(current => ({ ...current, property_id: data.id }));
      setPropertyName('');
      setPropertyAddress('');
      setPropertyModalOpen(false);
      addToast(text('Property created. Now add houses to it.', 'Bien immobilier créé. Vous pouvez maintenant y ajouter des maisons.'), 'success');
    }
    setSavingProperty(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('houses').delete().eq('id', deleteId);
    if (error) addToast(text('Cannot delete: house may have active tenants or payments', 'Suppression impossible : la maison peut avoir des locataires actifs ou des paiements.'), 'error');
    else { addToast(text('House deleted', 'Maison supprimée'), 'success'); load(); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('propertiesAndHouses')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{text('Create properties first, then add their rental houses.', 'Créez d’abord des biens immobiliers, puis ajoutez-y les maisons à louer.')}</p>
        </div>
        {!managerMode && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Building2 className="w-4 h-4" />} onClick={() => setPropertyModalOpen(true)}>{t('addProperty')}</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t('addHouse')}</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder={text('Search house number...', 'Rechercher un numéro de maison...')}
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
          <option value="">{text('All Statuses', 'Tous les statuts')}</option>
          <option value="vacant">{text('Vacant', 'Libre')}</option>
          <option value="occupied">{text('Occupied', 'Occupée')}</option>
          <option value="reserved">{text('Reserved', 'Réservée')}</option>
          <option value="maintenance">{text('Maintenance', 'En maintenance')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('House', 'Maison')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Property', 'Bien immobilier')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{text('Category', 'Catégorie')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{text('Floor/Block', 'Étage/Bloc')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Rent', 'Loyer')}</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Status', 'Statut')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && houses.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">{text('No houses found', 'Aucune maison trouvée')}</td></tr>
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
                    {h.properties?.name ?? text('Unassigned', 'Non attribué')}
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-700">
                    {(h.house_categories as any)?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {[h.floor && `${text('Floor', 'Étage')} ${h.floor}`, h.block_wing].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <p className="text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(h.monthly_rent))}</span></p>
                    <p className="text-xs text-slate-500">{text('Deposit:', 'Dépôt :')} <span className="money-value">{fmt(Number(h.security_deposit))}</span></p>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[h.status]}`}>
                      {houseStatus(h.status)}
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? text('Edit House', 'Modifier la maison') : t('addHouse')} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={text('House Number *', 'Numéro de maison *')} placeholder={text('e.g. A-101', 'ex. A-101')} value={form.house_number} onChange={set('house_number')} />
          <Select label={`${text('Property', 'Bien immobilier')} *`} value={form.property_id} onChange={set('property_id')}>
            <option value="">{text('Select property', 'Sélectionner un bien immobilier')}</option>
            {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
          </Select>
          {properties.length === 0 && !managerMode && (
            <p className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {text('Create a Property first, then add houses under it.', 'Créez d’abord un bien immobilier, puis ajoutez-y des maisons.')}
            </p>
          )}
          <Input label={text('Block / Wing', 'Bloc / Aile')} placeholder={text('e.g. Block A', 'ex. Bloc A')} value={form.block_wing} onChange={set('block_wing')} />
          <Input label={text('Floor', 'Étage')} placeholder={text('e.g. Ground, 1st', 'ex. Rez-de-chaussée, 1er')} value={form.floor} onChange={set('floor')} />
          <Select label={text('Category', 'Catégorie')} value={form.category_id} onChange={set('category_id')}>
            <option value="">{text('Select category', 'Sélectionner une catégorie')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label={text('Monthly Rent (Fbu)', 'Loyer mensuel (Fbu)')} type="number" placeholder="0" value={form.monthly_rent} onChange={set('monthly_rent')} />
          <Input label={text('Security Deposit (Fbu)', 'Dépôt de garantie (Fbu)')} type="number" placeholder="0" value={form.security_deposit} onChange={set('security_deposit')} />
          <Select label={text('Status', 'Statut')} value={form.status} onChange={set('status')}>
            <option value="vacant">{text('Vacant', 'Libre')}</option>
            <option value="occupied">{text('Occupied', 'Occupée')}</option>
            <option value="reserved">{text('Reserved', 'Réservée')}</option>
            <option value="maintenance">{text('Maintenance', 'En maintenance')}</option>
          </Select>
          <Input label={text('Image URL', "URL de l’image")} placeholder="https://..." value={form.image_url} onChange={set('image_url')} />
          <div className="sm:col-span-2">
            <Textarea label={text('Description', 'Description')} placeholder={text('Describe the unit...', 'Décrivez le logement...')} value={form.description} onChange={set('description')} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{text('Cancel', 'Annuler')}</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? text('Save Changes', 'Enregistrer les modifications') : t('addHouse')}</Button>
        </div>
      </Modal>

      <Modal open={propertyModalOpen} onClose={() => setPropertyModalOpen(false)} title={t('addProperty')} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{text('A property is the building or location that contains one or more rental houses.', 'Un bien immobilier est un bâtiment ou un emplacement qui contient une ou plusieurs maisons à louer.')}</p>
          <Input label={text('Property name *', 'Nom du bien immobilier *')} placeholder={text('e.g. Mirango', 'ex. Mirango')} value={propertyName} onChange={event => setPropertyName(event.target.value)} />
          <Input label={text('Property address (optional)', 'Adresse du bien immobilier (facultatif)')} placeholder={text('e.g. Mirango, Bujumbura', 'ex. Mirango, Bujumbura')} value={propertyAddress} onChange={event => setPropertyAddress(event.target.value)} />
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => setPropertyModalOpen(false)}>{text('Cancel', 'Annuler')}</Button>
            <Button loading={savingProperty} onClick={handleCreateProperty}>{text('Create Property', 'Créer le bien immobilier')}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={text('Delete House', 'Supprimer la maison')} size="sm">
        <p className="text-slate-700 mb-6">{text('Are you sure you want to delete this house? This cannot be undone.', 'Voulez-vous vraiment supprimer cette maison ? Cette action est irréversible.')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{text('Cancel', 'Annuler')}</Button>
          <Button variant="danger" onClick={handleDelete}>{text('Delete', 'Supprimer')}</Button>
        </div>
      </Modal>
    </div>
  );
}
