import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Plus, UserX, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useTheme } from '@/contexts/ThemeContext';
import StaffIdentityForm, { StaffHouse, StaffProperty } from '@/components/identity/StaffIdentityForm';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';
import { Profile } from '@/lib/supabase';

type Caretaker = Profile & {
  national_id?: string | null;
  residential_address?: string | null;
  staff_id?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

export default function CaretakersPage() {
  const { t, language } = useTheme();
  const text = (english: string, french: string) => language === 'fr' ? french : english;
  const { toasts, addToast, removeToast } = useToast();
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [houses, setHouses] = useState<StaffHouse[]>([]);
  const [properties, setProperties] = useState<StaffProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Caretaker | null>(null);
  const [staffForm, setStaffForm] = useState<Caretaker | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, email, phone, role, assigned_property_id, assigned_property_group_id, assigned_property_name, is_active, created_at, staff_id, national_id, residential_address, profile_photo_path, identity_document_path, signature_image_path')
      .eq('role', 'caretaker')
      .order('created_at', { ascending: false });
    if (error) addToast(error.message, 'error');
    else setCaretakers((data ?? []) as Caretaker[]);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const loadAssignments = async () => {
      const [houseResult, propertyResult] = await Promise.all([
        supabase.from('houses').select('id, house_number, property_id, status').order('house_number'),
        supabase.from('properties').select('id, name').order('name'),
      ]);
      const error = houseResult.error ?? propertyResult.error;
      if (error) {
        addToast(`${language === 'fr' ? 'Impossible de charger les biens immobiliers et les maisons' : 'Unable to load properties and houses'}: ${error.message}`, 'error');
        return;
      }
      setProperties(propertyResult.data ?? []);
      const propertyNameById = new Map((propertyResult.data ?? []).map(property => [property.id, property.name]));
      setHouses((houseResult.data ?? []).map(house => ({
        id: house.id,
        house_number: house.house_number,
        property_id: house.property_id,
        property_name: house.property_id
          ? propertyNameById.get(house.property_id) ?? (language === 'fr' ? 'Bien immobilier non attribué' : 'Unassigned property')
          : language === 'fr' ? 'Bien immobilier non attribué' : 'Unassigned property',
        status: house.status,
      })));
    };
    void loadAssignments();
  }, [addToast, language]);

  const updateCaretaker = async (caretaker: Caretaker, updates: Partial<Caretaker>) => {
    setSavingId(caretaker.id);
    const { error } = await supabase.from('profiles').update({
      ...(updates.assigned_property_name !== undefined
        ? { assigned_property_name: updates.assigned_property_name?.trim() || null }
        : {}),
      ...(updates.is_active !== undefined ? { is_active: updates.is_active } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', caretaker.id);
    if (error) {
      addToast(error.message, 'error');
      setSavingId(null);
      return false;
    }
    else {
      setCaretakers(items => items.map(item => item.id === caretaker.id ? { ...item, ...updates } : item));
      addToast(language === 'fr' ? 'Compte concierge mis à jour.' : 'Caretaker account updated.', 'success');
    }
    setSavingId(null);
    return true;
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('caretakers')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('caretakerManagement')}</p>
          </div>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setStaffForm(null)}>{t('addCaretaker')}</Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('loading')}</div>
      ) : caretakers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">{t('noCaretakers')}</div>
      ) : (
        <div className="space-y-3">
          {caretakers.map(caretaker => (
            <section key={caretaker.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <span className="text-lg font-bold uppercase">{caretaker.full_name.trim().charAt(0) || '?'}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-slate-900">{caretaker.full_name}</h2>
                    <p className="truncate text-sm text-slate-500">{caretaker.email}{caretaker.phone ? ` · ${caretaker.phone}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    icon={<Eye className="h-4 w-4" />}
                    onClick={() => setViewing(caretaker)}
                  >
                    {t('viewDetails')}
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => setStaffForm(caretaker)}
                  >
                    {text('Edit details and documents', 'Modifier les informations et les documents')}
                  </Button>
                  <Button
                    variant={caretaker.is_active ? 'danger' : 'secondary'}
                    icon={caretaker.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    loading={savingId === caretaker.id}
                    onClick={() => updateCaretaker(caretaker, { is_active: !caretaker.is_active })}
                  >
                    {caretaker.is_active ? t('deactivate') : t('activate')}
                  </Button>
                </div>
              </div>
              <p className={`mt-3 text-xs font-medium ${caretaker.is_active ? 'text-emerald-700' : 'text-red-600'}`}>
                {t('accountStatus')}: {caretaker.is_active ? t('active') : t('inactive')}
              </p>
            </section>
          ))}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={t('caretakerDetails')} size="md">
        {viewing && (
          <div className="space-y-4">
            <StaffIdentityCard
              profile={viewing}
              assignedProperties={viewing.assigned_property_name ? [viewing.assigned_property_name] : []}
            />
            <p className="text-sm text-slate-500">{t('accountStatus')}: {viewing.is_active ? t('active') : t('inactive')}</p>
          </div>
        )}
      </Modal>

      {staffForm !== undefined && (
        <StaffIdentityForm
          key={staffForm?.id ?? 'new-caretaker'}
          role="caretaker"
          houses={houses}
          properties={properties}
          initialProfile={staffForm}
          onClose={() => setStaffForm(undefined)}
          onSaved={load}
        />
      )}
    </div>
  );
}
