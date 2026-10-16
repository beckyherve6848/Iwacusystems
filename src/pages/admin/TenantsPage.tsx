import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Eye, UserPlus, UserCheck, UserX } from 'lucide-react';
import { Profile, supabase, Tenant } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import PrivateDocumentLink from '@/components/identity/PrivateDocumentLink';
import StaffIdentityForm, { StaffHouse, StaffProperty } from '@/components/identity/StaffIdentityForm';
import { hasExactImageDimensions, imageFileExtension, isPngOrJpeg } from '@/lib/identityFiles';

const PER_PAGE = 10;

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-700/50',
  vacated: 'bg-slate-100/50 text-slate-700 border-slate-600/50',
  blacklisted: 'bg-red-50 text-red-700 border-red-700/50',
};

const emptyForm = {
  full_name: '', phone: '', email: '', gender: '', national_id: '',
  house_id: '', move_in_date: '', move_out_date: '', monthly_rent: '',
  security_deposit: '', num_family_members: '0',
  car_make: '', car_model: '', car_registration: '', car_color: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  status: 'active', notes: '',
};

async function synchronizeHouseAssignment(houseId: string): Promise<string | null> {
  const { data: activeTenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, monthly_rent')
    .eq('house_id', houseId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tenantError) return tenantError.message;

  const { data: house, error: houseError } = await supabase
    .from('houses')
    .select('status, monthly_rent')
    .eq('id', houseId)
    .maybeSingle();
  if (houseError) return houseError.message;
  if (!house) return 'House record not found.';

  const nextStatus = activeTenant ? 'occupied' : house.status === 'occupied' ? 'vacant' : house.status;
  const nextRent = activeTenant?.monthly_rent ?? house.monthly_rent;
  if (nextStatus === house.status && nextRent === house.monthly_rent) return null;

  const { error: updateError } = await supabase
    .from('houses')
    .update({ status: nextStatus, monthly_rent: nextRent, updated_at: new Date().toISOString() })
    .eq('id', houseId);
  return updateError?.message ?? null;
}

type PendingUser = Profile & {
  created_at: string;
  national_id?: string | null;
  residential_address?: string | null;
  staff_id?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

type PendingAccountRole = 'tenant' | 'caretaker' | 'property_manager';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, PendingAccountRole>>({});
  const [pendingStaffSetup, setPendingStaffSetup] = useState<{
    role: 'caretaker' | 'property_manager';
    user: PendingUser;
  } | null>(null);
  const [houses, setHouses] = useState<{ id: string; house_number: string; monthly_rent: number; status: string }[]>([]);
  const [staffHouses, setStaffHouses] = useState<StaffHouse[]>([]);
  const [staffProperties, setStaffProperties] = useState<StaffProperty[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null);
  const [tenantPhotoUrls, setTenantPhotoUrls] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...emptyForm });
  const [tenantPhoto, setTenantPhoto] = useState<File | null>(null);
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removeAccountTenant, setRemoveAccountTenant] = useState<Tenant | null>(null);
  const [removingAccount, setRemovingAccount] = useState(false);
  const [denyPendingUser, setDenyPendingUser] = useState<PendingUser | null>(null);
  const [familyMembers, setFamilyMembers] = useState<{ full_name: string; relationship: string }[]>([]);
  const { toasts, addToast, removeToast } = useToast();
  const { language, t, fmt } = useTheme();
  const { profile } = useAuth();
  const text = (english: string, french: string) => language === 'fr' ? french : english;

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const loadHouses = useCallback(async () => {
    const { data, error } = await supabase
      .from('houses')
      .select('id, house_number, monthly_rent, status')
      .order('house_number');
    if (error) addToast(`Unable to load houses: ${error.message}`, 'error');
    else setHouses(data ?? []);
  }, [addToast]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('tenants')
      .select('*, houses(house_number, status)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,tenant_code.ilike.%${search}%`);
    if (filterStatus) q = q.eq('status', filterStatus);

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (!error) {
      const records = data ?? [];
      const photoRefs = records
        .map(tenant => tenant.photo_url)
        .filter((photoRef): photoRef is string => Boolean(photoRef?.startsWith('tenants/')));
      const photoUrlByPath: Record<string, string> = {};
      if (photoRefs.length) {
        const { data: signedPhotos, error: photoError } = await supabase.storage
          .from('identity-documents')
          .createSignedUrls([...new Set(photoRefs)], 3600);
        if (photoError) addToast(`Unable to load tenant profile photos: ${photoError.message}`, 'error');
        (signedPhotos ?? []).forEach(photo => {
          if (photo.path && photo.signedUrl) photoUrlByPath[photo.path] = photo.signedUrl;
        });
      }
      setTenantPhotoUrls(Object.fromEntries(records.map(tenant => [
        tenant.id,
        photoUrlByPath[tenant.photo_url ?? ''] ?? tenant.photo_url ?? '',
      ])));
      setTenants(records);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [addToast, page, search, filterStatus]);

  const loadPending = useCallback(async () => {
    // Get all profiles with role=tenant that don't have a matching tenants.user_id
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, is_active, created_at, national_id, residential_address, staff_id, profile_photo_path, identity_document_path, assigned_property_id, assigned_property_name')
      .eq('role', 'tenant')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!profiles?.length) { setPendingUsers([]); return; }

    const { data: existingTenants } = await supabase
      .from('tenants')
      .select('user_id')
      .not('user_id', 'is', null);

    const linkedUserIds = new Set((existingTenants ?? []).map(t => t.user_id));
    const pending = profiles.filter(p => !linkedUserIds.has(p.id));
    setPendingUsers(pending);
  }, []);

  useEffect(() => { load(); loadPending(); }, [load, loadPending]);

  useEffect(() => { void loadHouses(); }, [loadHouses]);

  useEffect(() => {
    const loadStaffAssignments = async () => {
      const [houseResult, propertyResult] = await Promise.all([
        supabase.from('houses').select('id, house_number, property_id, status').order('house_number'),
        supabase.from('properties').select('id, name').order('name'),
      ]);
      const error = houseResult.error ?? propertyResult.error;
      if (error) {
        addToast(`Unable to load staff properties: ${error.message}`, 'error');
        return;
      }
      setStaffProperties(propertyResult.data ?? []);
      const propertyNameById = new Map((propertyResult.data ?? []).map(property => [property.id, property.name]));
      setStaffHouses((houseResult.data ?? []).map(house => ({
        id: house.id,
        house_number: house.house_number,
        property_id: house.property_id,
        property_name: house.property_id ? propertyNameById.get(house.property_id) ?? 'Unassigned property' : 'Unassigned property',
        status: house.status,
      })));
    };
    void loadStaffAssignments();
  }, [addToast]);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setTenantPhoto(null);
    setIdentityDocument(null);
    setFamilyMembers([]);
    setEditingId(null);
    setEditingUserId(null);
    setModalOpen(true);
  };

  const openSetupFromPending = (user: PendingUser) => {
    setTenantPhoto(null);
    setForm({
      ...emptyForm,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone ?? '',
    });
    setFamilyMembers([]);
    setEditingId(null);
    setEditingUserId(user.id);
    setModalOpen(true);
  };

  const openEdit = async (t: Tenant) => {
    setIdentityDocument(null);
    setTenantPhoto(null);
    setForm({
      full_name: t.full_name, phone: t.phone, email: t.email,
      gender: t.gender ?? '', national_id: t.national_id ?? '',
      house_id: t.house_id ?? '', move_in_date: t.move_in_date ?? '',
      move_out_date: t.move_out_date ?? '', monthly_rent: String(t.monthly_rent ?? ''),
      security_deposit: String(t.security_deposit ?? ''),
      num_family_members: String(t.num_family_members),
      car_make: t.car_make ?? '', car_model: t.car_model ?? '',
      car_registration: t.car_registration ?? '', car_color: t.car_color ?? '',
      emergency_contact_name: t.emergency_contact_name ?? '',
      emergency_contact_phone: t.emergency_contact_phone ?? '',
      status: t.status, notes: t.notes ?? '',
    });
    const { data: family } = await supabase.from('tenant_family').select('*').eq('tenant_id', t.id);
    setFamilyMembers(family?.map(f => ({ full_name: f.full_name, relationship: f.relationship ?? '' })) ?? []);
    setEditingId(t.id);
    setEditingUserId(null);
    setModalOpen(true);
  };

  const openView = (t: Tenant) => {
    setViewTenant(t);
    setViewModal(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.email.trim()) {
      addToast(text('Name, phone and email are required', 'Le nom, le téléphone et l’adresse e-mail sont obligatoires.'), 'error'); return;
    }
    setSaving(true);
    const previousHouseId = editingId
      ? tenants.find(tenant => tenant.id === editingId)?.house_id ?? null
      : null;
    let followUpError: string | null = null;
    const payload = {
      full_name: form.full_name.trim(), phone: form.phone.trim(), email: form.email.trim(),
      gender: form.gender || null, national_id: form.national_id || null,
      house_id: form.house_id || null, move_in_date: form.move_in_date || null,
      move_out_date: form.move_out_date || null,
      monthly_rent: Number(form.monthly_rent) || null,
      security_deposit: Number(form.security_deposit) || null,
      num_family_members: Number(form.num_family_members) || 0,
      car_make: form.car_make || null, car_model: form.car_model || null,
      car_registration: form.car_registration || null, car_color: form.car_color || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      status: form.status, notes: form.notes || null,
      ...(editingUserId ? { user_id: editingUserId } : {}),
    };

    let tenantId = editingId;
    if (editingId) {
      const { error } = await supabase.from('tenants').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { addToast(error.message, 'error'); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('tenants').insert(payload).select().maybeSingle();
      if (error) { addToast(error.message, 'error'); setSaving(false); return; }
      tenantId = data?.id ?? null;
      if (tenantId && form.house_id && form.move_in_date) {
        const { error: occupancyError } = await supabase.from('occupancies').insert({
          house_id: form.house_id, tenant_id: tenantId,
          check_in_date: form.move_in_date, status: 'active',
        });
        if (occupancyError) followUpError = `${text('Tenant was saved, but occupancy history could not be recorded', 'Le locataire a été enregistré, mais l’historique d’occupation n’a pas pu être sauvegardé')}: ${occupancyError.message}`;
      }
    }

    const affectedHouseIds = new Set([previousHouseId, form.house_id || null].filter((id): id is string => Boolean(id)));
    for (const houseId of affectedHouseIds) {
      const syncError = await synchronizeHouseAssignment(houseId);
      if (syncError && !followUpError) {
        followUpError = `${text('Tenant was saved, but house occupancy could not be updated', 'Le locataire a été enregistré, mais le statut d’occupation de la maison n’a pas pu être mis à jour')}: ${syncError}`;
      }
    }

    if (tenantId && tenantPhoto) {
      const previousPhotoPath = editingId
        ? tenants.find(tenant => tenant.id === editingId)?.photo_url
        : null;
      const path = `tenants/${tenantId}/photo-${crypto.randomUUID()}.${imageFileExtension(tenantPhoto)}`;
      const { error: photoUploadError } = await supabase.storage.from('identity-documents')
        .upload(path, tenantPhoto, { contentType: tenantPhoto.type, upsert: false });
      if (photoUploadError) {
        addToast(`${text('Tenant profile was saved, but the photo could not be uploaded', 'Le profil du locataire a été enregistré, mais la photo n’a pas pu être téléversée')}: ${photoUploadError.message}`, 'error');
        setSaving(false);
        return;
      }
      const { error: photoPathError } = await supabase.from('tenants')
        .update({ photo_url: path, updated_at: new Date().toISOString() })
        .eq('id', tenantId);
      if (photoPathError) {
        const { error: cleanupError } = await supabase.storage.from('identity-documents').remove([path]);
        if (cleanupError) addToast(`${text('The uploaded tenant photo could not be cleaned up', 'La photo téléversée du locataire n’a pas pu être supprimée')}: ${cleanupError.message}`, 'error');
        addToast(`${text('Tenant profile was saved, but the photo could not be attached', 'Le profil du locataire a été enregistré, mais la photo n’a pas pu être associée')}: ${photoPathError.message}`, 'error');
        setSaving(false);
        return;
      }
      if (previousPhotoPath?.startsWith(`tenants/${tenantId}/photo-`)) {
        const { error: removeError } = await supabase.storage.from('identity-documents').remove([previousPhotoPath]);
        if (removeError) addToast(`${text('The new photo was saved, but the replaced photo could not be removed', 'La nouvelle photo a été enregistrée, mais l’ancienne photo n’a pas pu être supprimée')}: ${removeError.message}`, 'error');
      }
    }

    if (tenantId && familyMembers.length > 0) {
      await supabase.from('tenant_family').delete().eq('tenant_id', tenantId);
      await supabase.from('tenant_family').insert(
        familyMembers.filter(f => f.full_name.trim()).map(f => ({ tenant_id: tenantId, ...f }))
      );
    }

    if (tenantId && identityDocument) {
      const previousPath = editingId
        ? tenants.find(tenant => tenant.id === editingId)?.national_id_document_path
        : null;
      const extension = identityDocument.type === 'application/pdf' ? 'pdf' : imageFileExtension(identityDocument);
      const path = `tenants/${tenantId}/identity-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('identity-documents')
        .upload(path, identityDocument, { contentType: identityDocument.type, upsert: false });
      if (uploadError) {
        addToast(`${text('Tenant profile was saved, but the ID/Passport document could not be uploaded', 'Le profil du locataire a été enregistré, mais le document d’identité/passeport n’a pas pu être téléversé')}: ${uploadError.message}`, 'error');
        setSaving(false);
        return;
      }
      const { error: pathError } = await supabase.from('tenants')
        .update({ national_id_document_path: path, updated_at: new Date().toISOString() })
        .eq('id', tenantId);
      if (pathError) {
        await supabase.storage.from('identity-documents').remove([path]);
        addToast(`${text('The ID/Passport document was uploaded, but could not be attached to the tenant profile', 'Le document d’identité/passeport a été téléversé, mais n’a pas pu être associé au profil du locataire')}: ${pathError.message}`, 'error');
        setSaving(false);
        return;
      }
      if (previousPath) {
        const { error: removeError } = await supabase.storage.from('identity-documents').remove([previousPath]);
        if (removeError) {
          addToast(`${text('The new PDF was saved, but the replaced file could not be removed', 'Le nouveau PDF a été enregistré, mais l’ancien fichier n’a pas pu être supprimé')}: ${removeError.message}`, 'error');
        }
      }
    }

    if (followUpError) addToast(followUpError, 'error');
    else addToast(editingId ? text('Tenant updated', 'Locataire mis à jour') : text('Tenant profile created', 'Profil du locataire créé'), 'success');
    setModalOpen(false);
    load();
    loadPending();
    await loadHouses();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTenant) return;
    setDeleting(true);
    const tid = deleteTenant.id;
    const uid = deleteTenant.user_id;
    const tenantFiles = [
      deleteTenant.national_id_document_path,
      deleteTenant.photo_url?.startsWith(`tenants/${tid}/photo-`) ? deleteTenant.photo_url : null,
    ].filter((path): path is string => Boolean(path));
    if (tenantFiles.length) {
      const { error } = await supabase.storage.from('identity-documents')
        .remove(tenantFiles);
      if (error) {
        addToast(`${text('Unable to remove tenant profile files', 'Impossible de supprimer les fichiers du profil du locataire')}: ${error.message}`, 'error');
        setDeleting(false);
        return;
      }
    }
    // Delete all related records in order
    await supabase.from('tenant_family').delete().eq('tenant_id', tid);
    await supabase.from('rental_agreements').delete().eq('tenant_id', tid);
    await supabase.from('maintenance_requests').delete().eq('tenant_id', tid);
    await supabase.from('payments').delete().eq('tenant_id', tid);
    await supabase.from('occupancies').delete().eq('tenant_id', tid);
    // Delete the tenant record itself
    const { error: tenantDeleteError } = await supabase.from('tenants').delete().eq('id', tid);
    if (tenantDeleteError) {
      addToast(`${text('Unable to delete tenant', 'Impossible de supprimer le locataire')}: ${tenantDeleteError.message}`, 'error');
      setDeleting(false);
      return;
    }
    let followUpError: string | null = null;
    if (deleteTenant.house_id) {
      const syncError = await synchronizeHouseAssignment(deleteTenant.house_id);
      if (syncError) followUpError = `${text('Tenant was deleted, but house occupancy could not be updated', 'Le locataire a été supprimé, mais le statut d’occupation de la maison n’a pas pu être mis à jour')}: ${syncError}`;
    }
    // Delete auth profile & account so they cannot log in
    if (uid) {
      await supabase.from('notifications').delete().eq('user_id', uid);
      await supabase.from('profiles').delete().eq('id', uid);
    }
    if (followUpError) addToast(followUpError, 'error');
    else addToast(text('Tenant and all related data deleted', 'Le locataire et toutes les données associées ont été supprimés'), 'success');
    setDeleteTenant(null);
    setDeleting(false);
    load();
    loadPending();
    await loadHouses();
  };

  const handleDenyPending = async () => {
    if (!denyPendingUser) return;
    const { error } = await supabase.from('profiles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', denyPendingUser.id);
    if (error) {
      addToast(`${t('unableToDenyRegistration')}: ${error.message}`, 'error');
      return;
    }
    setDenyPendingUser(null);
    loadPending();
    addToast(t('registrationDeniedSuccess'), 'success');
  };

  const handleRemoveAccount = async () => {
    if (!removeAccountTenant?.user_id) return;
    setRemovingAccount(true);
    // Unlink user_id from tenant record first
    await supabase.from('tenants').update({ user_id: null }).eq('id', removeAccountTenant.id);
    // Delete the auth user via a service-role edge if available; otherwise just unlink
    // The profile row will also be cleared so the account is effectively gone
    await supabase.from('profiles').delete().eq('id', removeAccountTenant.user_id);
    addToast(
      language === 'fr' ? 'Compte supprimé. Le locataire peut se réinscrire.' : 'Account removed. The tenant can register again.',
      'success'
    );
    setRemoveAccountTenant(null);
    setRemovingAccount(false);
    load();
    loadPending();
  };

  const addFamilyMember = () => setFamilyMembers(f => [...f, { full_name: '', relationship: '' }]);
  const removeFamilyMember = (i: number) => setFamilyMembers(f => f.filter((_, idx) => idx !== i));
  const updateFamilyMember = (i: number, k: 'full_name' | 'relationship', v: string) =>
    setFamilyMembers(f => f.map((m, idx) => idx === i ? { ...m, [k]: v } : m));

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('tenants')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('manageTenants')}</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t('addTenant')}</Button>
      </div>

      {/* Pending Registrations */}
      {profile?.role !== 'property_manager' && pendingUsers.length > 0 && (
        <div className="pending-account-panel bg-amber-950/40 border border-amber-700/40 rounded-2xl p-5">
          <div className="pending-account-heading flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-amber-700 text-sm">
              {t('pendingRegistrations')} ({pendingUsers.length})
            </h3>
            <span className="pending-account-hint text-amber-500 text-xs ml-1">— {t('chooseAccountRole')}</span>
          </div>
          <div className="pending-account-list space-y-2">
            {pendingUsers.map(u => (
              <div key={u.id} className="pending-account-row flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="pending-account-avatar w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-amber-700">{u.full_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="pending-account-name text-slate-900 text-sm font-medium truncate">{u.full_name}</p>
                    <p className="pending-account-contact text-slate-500 text-xs truncate">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                  </div>
                </div>
                <div className="pending-account-controls flex items-center gap-3 shrink-0">
                  <p className="text-slate-500 text-xs hidden sm:block">
                    {text('Joined', 'Inscrit le')} {new Date(u.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')}
                  </p>
                  <div className="pending-account-actions flex items-center gap-2">
                    <Select
                      aria-label={`${t('roleFor')} ${u.full_name}`}
                      value={pendingRoles[u.id] ?? 'tenant'}
                      onChange={event => setPendingRoles(current => ({
                        ...current,
                        [u.id]: event.target.value as PendingAccountRole,
                      }))}
                      className="!w-auto !py-2 !text-xs"
                    >
                      <option value="tenant">{t('pendingRoleTenant')}</option>
                      <option value="caretaker">{t('caretaker')}</option>
                      <option value="property_manager">{t('propertyManager')}</option>
                    </Select>
                    <Button
                      size="sm"
                      icon={<UserCheck className="w-3.5 h-3.5" />}
                      onClick={() => (pendingRoles[u.id] ?? 'tenant') === 'tenant'
                        ? openSetupFromPending(u)
                        : setPendingStaffSetup({
                          role: pendingRoles[u.id] as 'caretaker' | 'property_manager',
                          user: u,
                        })}
                    >
                      {(pendingRoles[u.id] ?? 'tenant') === 'caretaker'
                        ? t('completeAsCaretaker')
                        : (pendingRoles[u.id] ?? 'tenant') === 'property_manager'
                          ? t('setUpPropertyManager')
                          : t('setUpTenant')}
                    </Button>
                    <button
                      onClick={() => setDenyPendingUser(u)}
                      title={t('registrationDenied')}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-100"
                    >
                      {t('registrationDenied')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder={text('Search name, phone, ID...', 'Rechercher un nom, téléphone ou numéro d’identité...')}
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
          <option value="active">{text('Active', 'Actif')}</option>
          <option value="vacated">{text('Vacated', 'Parti')}</option>
          <option value="blacklisted">{text('Blacklisted', 'Sur liste noire')}</option>
        </select>
      </div>

      <div className="tenant-list-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tenant-list-table-grid w-full">
            <thead>
              <tr className="tenant-list-table-heading border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('tenant')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{text('Contact', 'Coordonnées')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('houseNumber')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{text('Move In', 'Date d’entrée')}</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Status', 'Statut')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">{text('No tenants found', 'Aucun locataire trouvé')}</td></tr>
              )}
              {tenants.map(t => (
                <tr key={t.id} className="tenant-list-table-row hover:bg-slate-50 transition-colors">
                  <td className="tenant-list-name-cell px-5 py-3.5">
                    <div className="tenant-list-name-wrap flex items-center gap-3">
                      <div className="tenant-list-avatar w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {tenantPhotoUrls[t.id]
                          ? <img src={tenantPhotoUrls[t.id]} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-semibold text-slate-700">{t.full_name.charAt(0)}</span>
                        }
                      </div>
                      <div className="tenant-list-name-text min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-900 text-sm">{t.full_name}</p>
                          {t.user_id && (
                            <span title={text('Has account', 'Possède un compte')} className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{t.tenant_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <p className="text-sm text-slate-700">{t.phone}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[160px]">{t.email}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-700">
                    {t.houses?.house_number ?? <span className="text-slate-600">{text('Unassigned', 'Non attribuée')}</span>}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate-500">
                    {t.move_in_date ? new Date(t.move_in_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}
                  </td>
                  <td className="tenant-list-status-cell px-5 py-3.5 text-center">
                    <span className={`tenant-list-status inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[t.status]}`}>
                      {t.status === 'active' ? text('Active', 'Actif') : t.status === 'vacated' ? text('Vacated', 'Parti') : t.status === 'blacklisted' ? text('Blacklisted', 'Sur liste noire') : t.status}
                    </span>
                  </td>
                  <td className="tenant-list-actions-cell px-5 py-3.5 text-right">
                    <div className="tenant-list-actions flex items-center justify-end gap-1">
                      <button aria-label={text(`View ${t.full_name}`, `Voir ${t.full_name}`)} title={text('View', 'Voir')} onClick={() => openView(t)} className="tenant-list-action p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button aria-label={text(`Edit ${t.full_name}`, `Modifier ${t.full_name}`)} title={text('Edit', 'Modifier')} onClick={() => openEdit(t)} className="tenant-list-action p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {profile?.role === 'admin' && t.user_id && t.status === 'vacated' && (
                        <button
                          onClick={() => setRemoveAccountTenant(t)}
                          title={language === 'fr' ? 'Supprimer le compte' : 'Remove account'}
                          className="tenant-list-action p-2 text-slate-500 hover:text-orange-400 hover:bg-orange-900/20 rounded-lg transition-all"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                      {profile?.role === 'admin' && (
                        <button aria-label={text(`Delete ${t.full_name}`, `Supprimer ${t.full_name}`)} title={text('Delete', 'Supprimer')} onClick={() => setDeleteTenant(t)} className="tenant-list-action p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
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
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('editTenantProfile') : editingUserId ? t('completeTenantProfile') : t('addTenantProfile')}
        size="xl"
        className="tenant-edit-modal"
      >
        {editingUserId && !editingId && (
          <div className="tenant-edit-notice mb-4 p-3 bg-blue-950/50 border border-blue-700/40 rounded-xl text-sm text-blue-700 flex items-center gap-2">
            <UserCheck className="w-4 h-4 shrink-0" />
            {language === 'fr'
              ? "Configuration du profil d'un utilisateur inscrit — son compte sera automatiquement associé."
              : 'Setting up profile for a registered user — their account will be linked automatically.'}
          </div>
        )}
        <div className="tenant-edit-content space-y-6">
          {/* Personal */}
          <div className="tenant-edit-section">
            <h3 className="tenant-edit-section-title text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{text('Personal Information', 'Informations personnelles')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={text('Full Name *', 'Nom complet *')} placeholder={text('Enter full name', 'Saisissez le nom complet')} value={form.full_name} onChange={set('full_name')} />
              <Input label={text('Phone *', 'Téléphone *')} placeholder="+254 700 000 000" value={form.phone} onChange={set('phone')} />
              <Input label={text('Email *', 'E-mail *')} type="email" placeholder="name@example.com" value={form.email} onChange={set('email')} />
              <Select label={text('Gender', 'Genre')} value={form.gender} onChange={set('gender')}>
                <option value="">{text('Select gender', 'Sélectionner le genre')}</option>
                <option value="Male">{text('Male', 'Homme')}</option>
                <option value="Female">{text('Female', 'Femme')}</option>
                <option value="Other">{text('Other', 'Autre')}</option>
              </Select>
              <Input label={text('National ID / Passport', 'Carte nationale / Passeport')} placeholder={text('ID or passport number', 'Numéro de carte ou de passeport')} value={form.national_id} onChange={set('national_id')} />
              <label className="tenant-edit-file-label space-y-1.5 text-sm font-medium text-slate-700">
                {text('Tenant photo (500 × 500 PNG/JPG, max 10 MB)', 'Photo du locataire (PNG/JPG de 500 × 500, 10 Mo max.)')}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!isPngOrJpeg(file) || file.size > 10 * 1024 * 1024) {
                      addToast(text('Choose a PNG/JPG image up to 10 MB.', 'Choisissez une image PNG/JPG de 10 Mo maximum.'), 'error');
                      event.currentTarget.value = '';
                      return;
                    }
                    const input = event.currentTarget;
                    void hasExactImageDimensions(file, 500, 500).then(isExactSize => {
                      if (!isExactSize) {
                        addToast(text('Tenant photos must be exactly 500 × 500 pixels.', 'Les photos des locataires doivent mesurer exactement 500 × 500 pixels.'), 'error');
                        input.value = '';
                        return;
                      }
                      setTenantPhoto(file);
                    }).catch(caught => {
                      addToast(caught instanceof Error ? caught.message : text('The selected tenant photo could not be checked.', 'Impossible de vérifier la photo du locataire sélectionnée.'), 'error');
                      input.value = '';
                    });
                  }}
                  className="tenant-edit-file-input block w-full text-sm"
                />
                {tenantPhoto && <span className="block text-xs text-slate-500">{text('Selected:', 'Sélectionnée :')} {tenantPhoto.name}</span>}
              </label>
              {editingId && tenantPhotoUrls[editingId] && !tenantPhoto && (
                <div className="flex items-center gap-3">
                  <img src={tenantPhotoUrls[editingId]} alt="" className="h-12 w-12 rounded-full object-cover" />
                  <span className="text-xs text-slate-500">{text('Current tenant photo', 'Photo actuelle du locataire')}</span>
                </div>
              )}
              <label className="tenant-edit-file-label space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                {text('ID card / Passport (PDF or 500 × 500 PNG/JPG, max 10 MB)', 'Carte d’identité / Passeport (PDF ou PNG/JPG de 500 × 500, 10 Mo max.)')}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if ((file.type !== 'application/pdf' && !isPngOrJpeg(file)) || file.size > 10 * 1024 * 1024) {
                      addToast(text('Choose a PDF or PNG/JPG image up to 10 MB.', 'Choisissez un PDF ou une image PNG/JPG de 10 Mo maximum.'), 'error');
                      event.target.value = '';
                      return;
                    }
                    const input = event.currentTarget;
                    const validateAndSelect = async () => {
                      if (isPngOrJpeg(file)) {
                        try {
                          if (!await hasExactImageDimensions(file, 500, 500)) {
                            addToast(text('ID/passport images must be exactly 500 × 500 pixels.', 'Les images de carte d’identité/passeport doivent mesurer exactement 500 × 500 pixels.'), 'error');
                            input.value = '';
                            return;
                          }
                        } catch (caught) {
                          addToast(caught instanceof Error ? caught.message : text('The selected ID/passport image could not be checked.', 'Impossible de vérifier l’image de carte d’identité/passeport sélectionnée.'), 'error');
                          input.value = '';
                          return;
                        }
                      }
                      setIdentityDocument(file);
                    };
                    void validateAndSelect();
                  }}
                  className="tenant-edit-file-input block w-full text-sm"
                />
                {identityDocument && <span className="block text-xs text-slate-500">{text('Selected:', 'Sélectionné :')} {identityDocument.name}</span>}
              </label>
              {editingId && tenants.find(tenant => tenant.id === editingId)?.national_id_document_path && (
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-sm font-medium text-slate-700">{text('Current ID / Passport', 'Carte d’identité / Passeport actuel')}</p>
                  <PrivateDocumentLink path={tenants.find(tenant => tenant.id === editingId)?.national_id_document_path} label={text('current ID / Passport document', 'document de carte d’identité / passeport actuel')} />
                </div>
              )}
            </div>
          </div>

          {/* House */}
          <div className="tenant-edit-section">
            <h3 className="tenant-edit-section-title text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{text('House Assignment', 'Attribution d’une maison')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={text('Assign House', 'Attribuer une maison')}
                value={form.house_id}
                onChange={event => {
                  const houseId = event.target.value;
                  const selectedHouse = houses.find(house => house.id === houseId);
                  setForm(current => ({
                    ...current,
                    house_id: houseId,
                    monthly_rent: selectedHouse ? String(selectedHouse.monthly_rent) : '',
                  }));
                }}
              >
                <option value="">{text('Unassigned', 'Non attribuée')}</option>
                {houses
                  .filter(house => house.status === 'vacant' || house.id === form.house_id)
                  .map(house => <option key={house.id} value={house.id}>{house.house_number}</option>)}
              </Select>
              <Input label={text('Move-In Date', 'Date d’entrée')} type="date" value={form.move_in_date} onChange={set('move_in_date')} />
              <Input label={text('Move-Out Date', 'Date de départ')} type="date" value={form.move_out_date} onChange={set('move_out_date')} />
              <Input label={text('Monthly Rent (Fbu)', 'Loyer mensuel (Fbu)')} type="number" placeholder="0" value={form.monthly_rent} onChange={set('monthly_rent')} />
              <Input label={text('Security Deposit (Fbu)', 'Dépôt de garantie (Fbu)')} type="number" placeholder="0" value={form.security_deposit} onChange={set('security_deposit')} />
              <Select label={text('Status', 'Statut')} value={form.status} onChange={set('status')}>
                <option value="active">{text('Active', 'Actif')}</option>
                <option value="vacated">{text('Vacated', 'Parti')}</option>
                <option value="blacklisted">{text('Blacklisted', 'Sur liste noire')}</option>
              </Select>
            </div>
          </div>

          {/* Family */}
          <div className="tenant-edit-section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="tenant-edit-section-title text-xs font-semibold text-slate-500 uppercase tracking-wider">{text('Family Members', 'Membres de la famille')}</h3>
              <button onClick={addFamilyMember} className="text-xs text-blue-400 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> {text('Add Member', 'Ajouter un membre')}
              </button>
            </div>
            <Input label={text('Number of Family Members', 'Nombre de membres de la famille')} type="number" placeholder="0" value={form.num_family_members} onChange={set('num_family_members')} className="mb-3" />
            {familyMembers.map((m, i) => (
              <div key={i} className="flex items-end gap-2 mb-2">
                <Input placeholder={text('Full name', 'Nom complet')} value={m.full_name} onChange={e => updateFamilyMember(i, 'full_name', e.target.value)} className="flex-1" />
                <Input placeholder={text('Relationship', 'Lien de parenté')} value={m.relationship} onChange={e => updateFamilyMember(i, 'relationship', e.target.value)} className="flex-1" />
                <button onClick={() => removeFamilyMember(i)} className="p-2.5 text-red-400 hover:bg-red-50 rounded-lg mb-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Vehicle */}
          <div className="tenant-edit-section">
            <h3 className="tenant-edit-section-title text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{text('Vehicle Details (Optional)', 'Informations sur le véhicule (facultatif)')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label={text('Car Make', 'Marque du véhicule')} placeholder="Toyota" value={form.car_make} onChange={set('car_make')} />
              <Input label={text('Car Model', 'Modèle du véhicule')} placeholder="Corolla" value={form.car_model} onChange={set('car_model')} />
              <Input label={text('Registration No.', 'Numéro d’immatriculation')} placeholder="KAA 123X" value={form.car_registration} onChange={set('car_registration')} />
              <Input label={text('Color', 'Couleur')} placeholder={text('White', 'Blanc')} value={form.car_color} onChange={set('car_color')} />
            </div>
          </div>

          {/* Emergency */}
          <div className="tenant-edit-section">
            <h3 className="tenant-edit-section-title text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{text('Emergency Contact (Optional)', 'Contact d’urgence (facultatif)')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label={text('Contact Name', 'Nom du contact')} placeholder={text('Emergency contact full name', 'Nom complet du contact d’urgence')} value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
              <Input label={text('Contact Phone', 'Téléphone du contact')} placeholder="+254 700 000 000" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
            </div>
          </div>

          <Textarea label={text('Notes', 'Notes')} placeholder={text('Additional notes...', 'Notes complémentaires...')} value={form.notes} onChange={set('notes')} rows={2} />
        </div>

        <div className="tenant-edit-footer flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{text('Cancel', 'Annuler')}</Button>
          <Button loading={saving} onClick={handleSave}>{editingId ? text('Save Changes', 'Enregistrer les modifications') : text('Create Tenant Profile', 'Créer le profil du locataire')}</Button>
        </div>
      </Modal>
      {pendingStaffSetup && (
        <StaffIdentityForm
          key={pendingStaffSetup.user.id}
          role={pendingStaffSetup.role}
          houses={staffHouses}
          properties={staffProperties}
          initialProfile={pendingStaffSetup.user}
          onClose={() => setPendingStaffSetup(null)}
          onSaved={loadPending}
        />
      )}

      {/* View Modal */}
      {viewTenant && (
        <Modal open={viewModal} onClose={() => setViewModal(false)} title={text('Tenant Profile', 'Profil du locataire')} size="lg" className="tenant-profile-modal">
          <div className="tenant-profile-content space-y-4">
            <div className="tenant-profile-summary flex items-center gap-4">
              <div className="tenant-profile-photo w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                {tenantPhotoUrls[viewTenant.id]
                  ? <img src={tenantPhotoUrls[viewTenant.id]} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xl font-bold text-slate-700">{viewTenant.full_name.charAt(0)}</span>
                }
              </div>
              <div className="tenant-profile-identity min-w-0">
                <h3 className="tenant-profile-name text-lg font-bold text-slate-900">{viewTenant.full_name}</h3>
                <p className="tenant-profile-code text-slate-500 text-sm">{viewTenant.tenant_code}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`tenant-profile-status inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusColors[viewTenant.status]}`}>
                    {viewTenant.status === 'active' ? text('Active', 'Actif') : viewTenant.status === 'vacated' ? text('Vacated', 'Parti') : viewTenant.status === 'blacklisted' ? text('Blacklisted', 'Sur liste noire') : viewTenant.status}
                  </span>
                  {viewTenant.user_id && (
                    <span className="tenant-profile-account inline-flex items-center gap-1 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {text('Has account', 'Possède un compte')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="tenant-profile-fields grid grid-cols-2 gap-3 text-sm">
              {[
                [text('Phone', 'Téléphone'), viewTenant.phone], ['E-mail', viewTenant.email],
                [text('Gender', 'Genre'), viewTenant.gender === 'Male' ? text('Male', 'Homme') : viewTenant.gender === 'Female' ? text('Female', 'Femme') : viewTenant.gender === 'Other' ? text('Other', 'Autre') : viewTenant.gender], [text('National ID', 'Carte nationale'), viewTenant.national_id],
                [text('House', 'Maison'), viewTenant.houses?.house_number],
                [text('Move In', 'Date d’entrée'), viewTenant.move_in_date ? new Date(viewTenant.move_in_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB') : null],
                [text('Monthly Rent', 'Loyer mensuel'), viewTenant.monthly_rent ? fmt(Number(viewTenant.monthly_rent)) : null],
                [text('Security Deposit', 'Dépôt de garantie'), viewTenant.security_deposit ? fmt(Number(viewTenant.security_deposit)) : null],
                [text('Family Members', 'Membres de la famille'), viewTenant.num_family_members],
                [text('Emergency Contact', 'Contact d’urgence'), viewTenant.emergency_contact_name],
              ].map(([label, value]) => value != null && value !== '' && (
                <div key={String(label)} className="tenant-profile-field bg-white rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className="text-slate-900 font-medium">{String(value)}</p>
                </div>
              ))}
            </div>
            {(viewTenant.car_make || viewTenant.car_registration) && (
              <div className="tenant-profile-field bg-white rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">{text('Vehicle', 'Véhicule')}</p>
                <p className="text-slate-900">{[viewTenant.car_make, viewTenant.car_model, viewTenant.car_registration, viewTenant.car_color].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            <div className="tenant-profile-field rounded-xl bg-white p-3">
              <p className="mb-2 text-xs text-slate-500">{text('ID / Passport document', 'Document de carte d’identité / passeport')}</p>
              <PrivateDocumentLink path={viewTenant.national_id_document_path} label={text('ID / Passport document', 'Document de carte d’identité / passeport')} />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      <Modal open={!!deleteTenant} onClose={() => setDeleteTenant(null)} title={text('Delete Tenant', 'Supprimer le locataire')} size="sm">
        <div className="space-y-2 mb-6">
          <p className="text-slate-800 font-medium">{text('Delete', 'Supprimer')} {deleteTenant?.full_name} ?</p>
          <p className="text-slate-500 text-sm">{text('This will permanently delete:', 'Les éléments suivants seront définitivement supprimés :')}</p>
          <ul className="text-slate-500 text-sm space-y-1 list-disc ml-4">
            <li>{text('All payment records', 'Tous les paiements')}</li>
            <li>{text('Maintenance requests', 'Les demandes de maintenance')}</li>
            <li>{text('Rental agreements', 'Les contrats de location')}</li>
            <li>{text('Family members', 'Les membres de la famille')}</li>
            <li>{text('Login account (if any) — they must register again', 'Le compte de connexion (le cas échéant) — une nouvelle inscription sera nécessaire')}</li>
          </ul>
          <p className="text-red-400 text-sm font-medium mt-2">{text('This cannot be undone.', 'Cette action est irréversible.')}</p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteTenant(null)}>{text('Cancel', 'Annuler')}</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>{text('Delete Everything', 'Tout supprimer')}</Button>
        </div>
      </Modal>

      {/* Dismiss pending registration */}
      <Modal open={!!denyPendingUser} onClose={() => setDenyPendingUser(null)} title={t('denyRegistration')} size="sm">
        <p className="mb-6 text-slate-700">
          {denyPendingUser?.full_name}: {t('denyRegistrationConfirm')}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDenyPendingUser(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={handleDenyPending}>{t('registrationDenied')}</Button>
        </div>
      </Modal>

      {/* Remove Account Confirm */}
      <Modal
        open={!!removeAccountTenant}
        onClose={() => setRemoveAccountTenant(null)}
        title={language === 'fr' ? 'Supprimer le compte' : 'Remove Account'}
        size="sm"
      >
        <div className="space-y-3 mb-6">
          <p className="text-slate-700">
            {language === 'fr'
              ? `Supprimer le compte de connexion de ${removeAccountTenant?.full_name} ?`
              : `Remove the login account for ${removeAccountTenant?.full_name}?`}
          </p>
          <p className="text-slate-500 text-sm">
            {language === 'fr'
              ? 'Leur profil de locataire sera conservé. Ils pourront créer un nouveau compte en se réinscrivant.'
              : 'Their tenant profile will be kept. They can create a new account by registering again.'}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRemoveAccountTenant(null)}>
            {language === 'fr' ? 'Annuler' : 'Cancel'}
          </Button>
          <Button variant="danger" loading={removingAccount} icon={<UserX className="w-4 h-4" />} onClick={handleRemoveAccount}>
            {language === 'fr' ? 'Supprimer le compte' : 'Remove Account'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
