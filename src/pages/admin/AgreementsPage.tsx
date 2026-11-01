import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Plus, Pencil, Trash2, FileText, Download, Eye } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import AgreementDocument from '@/components/AgreementDocument';
import { printDocument } from '@/lib/print';

interface Agreement {
  id: string;
  agreement_number: string;
  tenant_id: string;
  house_id: string;
  lease_start_date: string;
  lease_end_date?: string;
  monthly_rent: number;
  security_deposit: number;
  terms_and_conditions?: string;
  landlord_signature?: string;
  tenant_signature?: string;
  status: string;
  created_at: string;
  tenants?: any;
  houses?: any;
}

const emptyForm = {
  tenant_id: '', house_id: '', lease_start_date: '', lease_end_date: '',
  monthly_rent: '', security_deposit: '', terms_and_conditions: '',
  landlord_signature: '', status: 'active',
};

const defaultTerms = `1. RENT: Rent is due on the 1st of each month. Late payments attract a penalty.
2. DEPOSIT: Security deposit is refundable upon satisfactory vacating of the premises.
3. PROPERTY CARE: Tenant shall maintain the property in good condition.
4. ALTERATIONS: No alterations to the property without prior written consent.
5. SUBLETTING: Subletting is not permitted without written permission from the landlord.
6. TERMINATION: Either party may terminate this agreement with 30 days written notice.
7. VISITORS: Long-term guests (>14 days) must be registered with management.
8. UTILITIES: Tenant is responsible for their utility bills unless otherwise agreed.`;
const defaultTermsFr = `1. LOYER : Le loyer est dû le premier jour de chaque mois. Tout retard de paiement peut entraîner une pénalité.
2. DÉPÔT : Le dépôt de garantie est remboursable après la libération satisfaisante des lieux.
3. ENTRETIEN DU BIEN : Le locataire doit maintenir le bien en bon état.
4. MODIFICATIONS : Aucune modification du bien n’est autorisée sans accord écrit préalable.
5. SOUS-LOCATION : La sous-location est interdite sans autorisation écrite du propriétaire.
6. RÉSILIATION : Chaque partie peut résilier le présent contrat avec un préavis écrit de 30 jours.
7. VISITEURS : Les visiteurs de longue durée (plus de 14 jours) doivent être déclarés à la gestion.
8. CHARGES : Le locataire est responsable de ses factures de services, sauf accord contraire.`;

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e9ecef',
  borderRadius: '1rem',
  overflow: 'hidden',
};

export default function AgreementsPage() {
  const { user } = useAuth();
  const { t, fmt, language } = useTheme();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [houses, setHouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [viewAgreement, setViewAgreement] = useState<Agreement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<any>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rental_agreements')
      .select('*, tenants(full_name, tenant_code), houses(house_number)')
      .order('created_at', { ascending: false });
    setAgreements(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    supabase.from('tenants').select('id, full_name, tenant_code, house_id, monthly_rent, security_deposit').eq('status', 'active').then(({ data }) => setTenants(data ?? []));
    supabase.from('houses').select('id, house_number, monthly_rent, security_deposit').then(({ data }) => setHouses(data ?? []));
  }, []);

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    const tenant = tenants.find(tn => tn.id === tid);
    setForm(f => ({
      ...f, tenant_id: tid,
      house_id: tenant?.house_id ?? '',
      monthly_rent: String(tenant?.monthly_rent ?? ''),
      security_deposit: String(tenant?.security_deposit ?? ''),
    }));
  };

  const openAdd = () => {
    setForm({ ...emptyForm, terms_and_conditions: language === 'fr' ? defaultTermsFr : defaultTerms });
    setEditingId(null); setModalOpen(true);
  };

  const openEdit = (a: Agreement) => {
    setForm({
      tenant_id: a.tenant_id, house_id: a.house_id,
      lease_start_date: a.lease_start_date, lease_end_date: a.lease_end_date ?? '',
      monthly_rent: String(a.monthly_rent), security_deposit: String(a.security_deposit),
      terms_and_conditions: a.terms_and_conditions ?? '', landlord_signature: a.landlord_signature ?? '',
      status: a.status,
    });
    setEditingId(a.id); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.tenant_id || !form.house_id || !form.lease_start_date) {
      addToast(t('agreementRequiredFields'), 'error'); return;
    }
    setSaving(true);
    const payload = {
      tenant_id: form.tenant_id, house_id: form.house_id,
      lease_start_date: form.lease_start_date, lease_end_date: form.lease_end_date || null,
      monthly_rent: Number(form.monthly_rent) || 0,
      security_deposit: Number(form.security_deposit) || 0,
      terms_and_conditions: form.terms_and_conditions || null,
      landlord_signature: form.landlord_signature || null,
      status: form.status,
    };
    const { error } = editingId
      ? await supabase.from('rental_agreements').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('rental_agreements').insert(payload);
    if (error) addToast(error.message, 'error');
    else { addToast(editingId ? t('agreementUpdatedSuccess') : t('agreementCreatedSuccess'), 'success'); setModalOpen(false); load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('rental_agreements').delete().eq('id', deleteId);
    if (error) addToast(error.message, 'error');
    else { addToast(t('agreementDeletedSuccess'), 'success'); load(); }
    setDeleteId(null);
  };

  const handlePrint = (a: Agreement) => {
    setViewAgreement(a);
    setTimeout(() => printDocument('agreement', 'agreement-print'), 600);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('rentalAgreementsTitle')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('manageAgreements')}</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t('newAgreement')}</Button>
      </div>

      <div className="agreement-table-panel dark-theme-surface" style={panelStyle}>
        <div className="overflow-hidden">
          <table className="agreement-table w-full table-fixed">
            <thead>
              <tr style={{ borderBottom: '1px solid #e9ecef' }}>
                {[t('agreement'), t('tenant'), t('leasePeriod'), t('rentLabel'), t('status'), t('actions')].map((h, i) => (
                  <th key={h} className={`px-2 py-3 text-left text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5 sm:py-3.5 sm:text-xs sm:tracking-wider ${i === 0 ? 'w-[38%] sm:w-auto' : ''} ${i === 4 ? 'w-[22%] text-center sm:w-auto' : ''} ${i === 5 ? 'w-[40%] text-right sm:w-auto' : ''} ${i > 1 && i < 4 ? 'hidden lg:table-cell' : ''} ${i === 1 ? 'hidden md:table-cell' : ''} ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ '--tw-divide-opacity': 1 } as any}>
              {loading && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
                </td></tr>
              )}
              {!loading && agreements.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">{t('noAgreements')}</td></tr>
              )}
              {agreements.map(a => (
                <tr key={a.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderColor: '#f9fafb' }}>
                  <td className="overflow-hidden px-2 py-3 sm:px-5 sm:py-3.5">
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                      <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex" style={{ background: 'rgba(99,102,241,0.15)' }}>
                        <FileText className="w-4 h-4 text-indigo-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 text-[11px] sm:text-sm">{a.agreement_number}</p>
                        <p className="truncate text-[9px] text-slate-500 sm:text-xs">{(a.houses as any)?.house_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-900">{(a.tenants as any)?.full_name}</p>
                    <p className="text-xs text-slate-500">{(a.tenants as any)?.tenant_code}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {new Date(a.lease_start_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')} – {a.lease_end_date ? new Date(a.lease_end_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB') : t('ongoing')}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-right text-sm font-semibold text-slate-900">
                    <span className="money-value">{fmt(Number(a.monthly_rent))}</span>
                  </td>
                  <td className="overflow-hidden px-1 py-3 text-center sm:px-5 sm:py-3.5">
                    <span className={`inline-flex max-w-full items-center truncate rounded-full px-1.5 py-1 text-[9px] font-medium capitalize sm:px-2.5 sm:text-xs ${
                      a.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                      a.status === 'expired' ? 'bg-slate-100/50 text-slate-700' :
                      'bg-red-50 text-red-700'
                    }`}>{a.status === 'expired' ? t('expiredStatus') : a.status === 'terminated' ? t('terminatedStatus') : t(a.status)}</span>
                  </td>
                  <td className="overflow-hidden px-1 py-2 text-right sm:px-5 sm:py-3.5">
                    <div className="flex items-center justify-end gap-0 sm:gap-1">
                      <button onClick={() => setViewAgreement(a)} title={t('agreementView')} aria-label={`${t('agreementView')} ${a.agreement_number}`} className="rounded-lg p-1 text-slate-500 transition-all hover:bg-blue-900/20 hover:text-blue-400 sm:p-2">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePrint(a)} title={t('downloadPrint')} aria-label={`${t('downloadPrint')} ${a.agreement_number}`} className="rounded-lg p-1 text-slate-500 transition-all hover:bg-amber-900/20 hover:text-amber-400 sm:p-2">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(a)} title={t('edit')} aria-label={`${t('edit')} ${a.agreement_number}`} className="rounded-lg p-1 text-slate-500 transition-all hover:bg-blue-900/20 hover:text-blue-400 sm:p-2">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteId(a.id)} title={t('delete')} aria-label={`${t('delete')} ${a.agreement_number}`} className="rounded-lg p-1 text-slate-500 transition-all hover:bg-red-900/20 hover:text-red-400 sm:p-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? t('editAgreement') : t('newAgreement')} size="xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-500 block mb-1.5">{t('tenant')} *</label>
            <Select
              value={form.tenant_id} onChange={handleTenantChange}
              className="dark-theme-surface w-full text-slate-900 text-sm rounded-xl py-2.5 px-4 focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}
            >
              <option value="">{t('chooseTenant')}</option>
              {tenants.map(tn => <option key={tn.id} value={tn.id}>{tn.full_name} ({tn.tenant_code})</option>)}
            </Select>
          </div>
          <Select label={t('houseRequired')} value={form.house_id} onChange={set('house_id')}>
            <option value="">{t('selectHouse')}</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Select label={t('status')} value={form.status} onChange={set('status')}>
            <option value="active">{t('active')}</option>
            <option value="expired">{t('expiredStatus')}</option>
            <option value="terminated">{t('terminatedStatus')}</option>
          </Select>
          <Input label={t('leaseStartDate')} type="date" value={form.lease_start_date} onChange={set('lease_start_date')} />
          <Input label={t('leaseEndDate')} type="date" value={form.lease_end_date} onChange={set('lease_end_date')} />
          <Input label={t('monthlyRentLabel')} type="number" value={form.monthly_rent} onChange={set('monthly_rent')} />
          <Input label={t('securityDeposit')} type="number" value={form.security_deposit} onChange={set('security_deposit')} />
          <Input label={t('landlordSignatureName')} placeholder={t('landlordFullName')} value={form.landlord_signature} onChange={set('landlord_signature')} />
          <div className="sm:col-span-2">
            <Textarea label={t('termsConditions')} value={form.terms_and_conditions} onChange={set('terms_and_conditions')} rows={8} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? t('agreementSaveChanges') : t('createAgreement')}</Button>
        </div>
      </Modal>

      {/* View/Print Modal */}
      {viewAgreement && (
        <Modal open={!!viewAgreement} onClose={() => setViewAgreement(null)} title={t('rentalAgreement')} size="xl">
          <AgreementDocument agreement={viewAgreement} />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setViewAgreement(null)}>{t('closeButton')}</Button>
            <Button icon={<Download className="w-4 h-4" />} onClick={() => printDocument('agreement', 'agreement-print')}>{t('downloadPrint')}</Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('deleteAgreement')} size="sm">
        <p className="text-slate-700 mb-2">{t('confirmDeleteAgreement')}</p>
        <p className="text-red-400 text-sm mb-6">{t('cannotBeUndone')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('deleteAgreementButton')}</Button>
        </div>
      </Modal>

    </div>
  );
}
