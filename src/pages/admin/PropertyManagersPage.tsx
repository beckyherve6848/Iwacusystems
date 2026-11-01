import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Pencil, Plus, Save, UserRound } from 'lucide-react';
import { Profile, supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import StaffIdentityForm, { StaffHouse, StaffProperty } from '@/components/identity/StaffIdentityForm';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';
import { useTheme } from '@/contexts/ThemeContext';

type Manager = Profile & {
  national_id?: string | null;
  residential_address?: string | null;
  staff_id?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

export default function PropertyManagersPage() {
  const { t, language } = useTheme();
  const text = (english: string, french: string) => language === 'fr' ? french : english;
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managerPhotoUrls, setManagerPhotoUrls] = useState<Record<string, string>>({});
  const [houses, setHouses] = useState<StaffHouse[]>([]);
  const [properties, setProperties] = useState<StaffProperty[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState<Manager | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const loadManagerPhotos = async () => {
      const photos = await Promise.all(managers.map(async manager => {
        if (!manager.profile_photo_path) return [manager.id, null] as const;
        const { data, error } = await supabase.storage
          .from('identity-documents')
          .createSignedUrl(manager.profile_photo_path, 300);
        if (error) {
          if (!/failed to fetch|networkerror|fetch failed|load failed/i.test(error.message)) {
            console.error(`Unable to load profile photo for manager ${manager.id}:`, error.message);
          }
          return [manager.id, null] as const;
        }
        return [manager.id, data.signedUrl] as const;
      }));
      if (cancelled) return;
      setManagerPhotoUrls(Object.fromEntries(photos.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    };
    void loadManagerPhotos().catch((caught: unknown) => {
      if (!cancelled) console.error('Unable to load property manager profile photos:', caught);
    });
    return () => { cancelled = true; };
  }, [managers]);

  useEffect(() => {
    const load = async () => {
    setLoading(true);
    const managerQuery = supabase.from('profiles').select('id, full_name, email, phone, role, is_active, created_at, staff_id, national_id, residential_address, profile_photo_path, identity_document_path, signature_image_path, assigned_property_id, assigned_property_name')
      .eq('role', 'property_manager').order('created_at', { ascending: false });
    const houseQuery = supabase.from('houses').select('id, house_number, status, property_id').order('house_number');
    const propertyQuery = supabase.from('properties').select('id, name').order('name');
    const assignmentQuery = supabase.from('property_manager_houses').select('manager_id, house_id');
    let results: [
      Awaited<typeof managerQuery>,
      Awaited<typeof houseQuery>,
      Awaited<typeof propertyQuery>,
      Awaited<typeof assignmentQuery>,
    ];
    try {
      results = await Promise.all([managerQuery, houseQuery, propertyQuery, assignmentQuery]);
    } catch (caught: unknown) {
      console.error('Unable to load property managers:', caught);
      const caughtMessage = caught instanceof Error ? caught.message : String(caught);
      const isNetworkError = caught instanceof TypeError || /failed to fetch|networkerror|fetch failed|load failed/i.test(caughtMessage);
      const message = isNetworkError
        ? text(
          'Internet unavailable. Check your connection and try again.',
          'Connexion Internet indisponible. Vérifiez votre connexion et réessayez.',
        )
        : text(
          'Unable to load property managers. Please try again.',
          'Impossible de charger les gestionnaires immobiliers. Veuillez réessayer.',
        );
      setLoadError(message);
      addToast(message, 'error');
      setLoading(false);
      return;
    }
    const [managerResult, houseResult, propertyResult, assignmentResult] = results;
    const error = managerResult.error ?? houseResult.error ?? propertyResult.error ?? assignmentResult.error;
    if (error) {
      console.error('Unable to load property managers:', error);
      const isNetworkError = /failed to fetch|networkerror|fetch failed|load failed/i.test(error.message);
      const loadError = isNetworkError
        ? text(
          'Internet unavailable. Check your connection and try again.',
          'Connexion Internet indisponible. Vérifiez votre connexion et réessayez.',
        )
        : error.message.includes('property_manager_houses')
        ? language === 'fr'
          ? 'La configuration de la base de données des gestionnaires immobiliers est incomplète. Appliquez la migration complète supabase/migrations/20261011140000_add_property_manager_role.sql dans l’éditeur SQL Supabase, puis actualisez cette page.'
          : 'Property Manager database setup is incomplete. Apply the full supabase/migrations/20261011140000_add_property_manager_role.sql migration in Supabase SQL Editor, then refresh this page.'
        : error.message.includes('properties') || error.message.includes('property_id')
          ? language === 'fr'
            ? 'L’attribution des biens immobiliers et des maisons n’est pas encore installée. Appliquez supabase/migrations/20261012112000_add_property_and_house_assignments.sql dans l’éditeur SQL Supabase, puis actualisez cette page.'
            : 'Property and house assignments are not installed yet. Apply supabase/migrations/20261012112000_add_property_and_house_assignments.sql in Supabase SQL Editor, then refresh this page.'
        : text(
          'Unable to load property managers. Please try again.',
          'Impossible de charger les gestionnaires immobiliers. Veuillez réessayer.',
        );
      setLoadError(loadError);
      addToast(loadError, 'error');
    } else {
      setLoadError(null);
      const loadedManagers = managerResult.data ?? [];
      const loadedAssignments: Record<string, string[]> = {};
      for (const item of assignmentResult.data ?? []) {
        loadedAssignments[item.manager_id] = [...(loadedAssignments[item.manager_id] ?? []), item.house_id];
      }
      setManagers(loadedManagers);
      setProperties(propertyResult.data ?? []);
      const propertyNameById = new Map((propertyResult.data ?? []).map(property => [property.id, property.name]));
      setHouses((houseResult.data ?? []).map(house => ({
        id: house.id,
        house_number: house.house_number,
        status: house.status,
        property_id: house.property_id,
        property_name: house.property_id
          ? propertyNameById.get(house.property_id) ?? (language === 'fr' ? 'Bien immobilier non attribué' : 'Unassigned property')
          : language === 'fr' ? 'Bien immobilier non attribué' : 'Unassigned property',
      })));
      setAssignments(loadedAssignments);
      const initialManager = loadedManagers[0]?.id ?? '';
      setSelectedManager(initialManager);
      const initialHouseIds = loadedAssignments[initialManager] ?? [];
      setSelectedProperties([...new Set(
        (houseResult.data ?? [])
          .filter(house => initialHouseIds.includes(house.id))
          .flatMap(house => house.property_id ? [house.property_id] : []),
      )]);
    }
    setLoading(false);
    };
    load();
  }, [addToast, language, refreshKey]);

  const chooseManager = (id: string) => {
    setSelectedManager(id);
    const assignedHouseIds = assignments[id] ?? [];
    setSelectedProperties([...new Set(
      houses
        .filter(house => assignedHouseIds.includes(house.id))
        .flatMap(house => house.property_id ? [house.property_id] : []),
    )]);
  };

  const toggleProperty = (propertyId: string) => {
    const propertyHouseIds = houses.filter(house => house.property_id === propertyId).map(house => house.id);
    const ownedByOtherManager = Object.entries(assignments).some(([managerId, houseIds]) =>
      managerId !== selectedManager && propertyHouseIds.some(houseId => houseIds.includes(houseId)));
    if (ownedByOtherManager && !selectedProperties.includes(propertyId)) {
      addToast(text('This property is already assigned to another property manager.', 'Ce bien immobilier est déjà attribué à un autre gestionnaire immobilier.'), 'error');
      return;
    }
    setSelectedProperties(current => current.includes(propertyId)
      ? current.filter(id => id !== propertyId)
      : [...current, propertyId]);
  };

  const saveAssignments = async () => {
    if (!selectedManager) return;
    setSaving(true);
    const targetHouseIds = houses
      .filter(house => house.property_id && selectedProperties.includes(house.property_id))
      .map(house => house.id);
    const { error } = await supabase.rpc('assign_property_manager_houses', {
      target_manager_id: selectedManager,
      target_house_ids: targetHouseIds,
    });
    if (error) {
      addToast(`${text('Unable to save property assignments', 'Impossible d’enregistrer les attributions des biens immobiliers')}: ${error.message}`, 'error');
    } else {
      addToast(text('Property assignments saved. Account access updated.', 'Attributions enregistrées. L’accès au compte a été mis à jour.'), 'success');
      setAssignments(current => ({ ...current, [selectedManager]: targetHouseIds }));
      setManagers(current => current.map(manager => manager.id === selectedManager
        ? { ...manager, is_active: targetHouseIds.length > 0 }
        : manager));
    }
    setSaving(false);
  };

  const manager = managers.find(item => item.id === selectedManager);
  const propertiesWithHouses = properties.map(property => ({
    ...property,
    houses: houses.filter(house => house.property_id === property.id),
  }));
  const assignableProperties = propertiesWithHouses.filter(property => property.houses.length > 0);
  const assignedPropertyIds = (managerId: string) => [...new Set(
    (assignments[managerId] ?? [])
      .map(houseId => houses.find(house => house.id === houseId)?.property_id)
      .filter((propertyId): propertyId is string => Boolean(propertyId)),
  )];
  const unavailableHouseIds = Object.entries(assignments)
    .filter(([managerId]) => managerId !== selectedManager)
    .flatMap(([, houseIds]) => houseIds);
  const unavailableHouseIdsForForm = Object.entries(assignments)
    .filter(([managerId]) => managerId !== staffForm?.id)
    .flatMap(([, houseIds]) => houseIds);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('propertyManagers')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('managePropertyManagers')}</p>
          </div>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setStaffForm(null)}>{t('addPropertyManager')}</Button>
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{text('Loading property managers...', 'Chargement des gestionnaires immobiliers...')}</div>
      ) : loadError ? (
        <div role="alert" className="property-manager-load-alert rounded-xl border p-4 text-sm">
          <AlertTriangle className="property-manager-load-alert-icon h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{loadError}</p>
        </div>
      ) : managers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {text('No Property Manager registrations yet.', 'Aucune inscription de gestionnaire immobilier pour le moment.')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <section className="space-y-3">
            {managers.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseManager(item.id)}
                className={`property-manager-card ${managerPhotoUrls[item.id] ? 'property-manager-card-photo-background' : ''} w-full rounded-2xl border p-4 text-left transition-colors ${
                  selectedManager === item.id ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                style={managerPhotoUrls[item.id] ? {
                  backgroundImage: `linear-gradient(90deg, rgba(24, 25, 26, 0.98) 0%, rgba(36, 37, 38, 0.92) 42%, rgba(36, 37, 38, 0.54) 72%, rgba(36, 37, 38, 0.24) 100%), url("${managerPhotoUrls[item.id]}")`,
                  backgroundPosition: 'center, right center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '100% 100%, cover',
                } : undefined}
              >
                <div className="property-manager-card-content flex min-h-24 items-center">
                  <div className="min-w-0 w-[72%]">
                    <p className="property-manager-card-name property-manager-brand-font truncate font-semibold text-slate-900">{item.full_name}</p>
                    <p className="property-manager-card-contact mt-1 truncate text-xs text-slate-500">{item.email}</p>
                    {item.phone && <p className="property-manager-card-contact mt-0.5 text-xs text-slate-500">{item.phone}</p>}
                    <div className="property-manager-card-footer mt-3 flex flex-wrap items-center gap-2">
                      <p className="property-manager-card-assignment text-xs text-slate-500">
                        {assignedPropertyIds(item.id).length} {text('assigned', 'attribué(s)')} {assignedPropertyIds(item.id).length === 1 ? text('property', 'bien immobilier') : text('properties', 'biens immobiliers')}
                      </p>
                      <span className={`property-manager-card-status inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        item.is_active ? 'border-emerald-500 text-emerald-700' : 'border-amber-500 text-amber-700'
                      }`}>
                        {item.is_active ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {item.is_active ? text('Approved', 'Approuvé') : text('Pending', 'En attente')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center text-white">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="property-manager-brand-font font-semibold text-slate-900">{manager?.full_name}</h2>
                <p className="text-sm text-slate-500">{text('Choose available properties to assign to this manager. You can assign multiple properties, but each property can have only one manager.', 'Choisissez les biens immobiliers disponibles à attribuer à ce gestionnaire. Vous pouvez attribuer plusieurs biens, mais chaque bien ne peut avoir qu’un seul gestionnaire.')}</p>
              </div>
            </div>
            {manager && (
              <>
                <StaffIdentityCard
                  profile={manager}
                  assignedProperties={(assignments[manager.id] ?? [])
                    .map(id => {
                      const house = houses.find(item => item.id === id);
                      return house?.property_name ?? null;
                    })
                    .filter((name): name is string => Boolean(name))
                    .filter((name, index, allNames) => allNames.indexOf(name) === index)}
                />
                <Button
                  variant="outline"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => setStaffForm(manager)}
                  className="my-4"
                >
                  {text('Edit identity and documents', 'Modifier l’identité et les documents')}
                </Button>
              </>
            )}
            {assignableProperties.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{text('Create properties and add houses before approving a manager.', 'Créez des biens immobiliers et ajoutez-y des maisons avant d’approuver un gestionnaire.')}</p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {assignableProperties.map(property => {
                  const propertyHouseIds = property.houses.map(house => house.id);
                  const assignedToOtherManager = Object.entries(assignments).some(([managerId, houseIds]) =>
                    managerId !== selectedManager && propertyHouseIds.some(houseId => houseIds.includes(houseId)));
                  const selected = selectedProperties.includes(property.id);
                  const unavailable = assignedToOtherManager && !selected;
                  return (
                  <label key={property.id} className={`flex items-center gap-3 rounded-xl border border-slate-100 p-3 ${unavailable ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={unavailable || property.houses.length === 0}
                      onChange={() => toggleProperty(property.id)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{property.name}</span>
                      <span className="block text-xs capitalize text-slate-500">
                        {unavailable
                          ? text('Assigned to another manager', 'Attribué à un autre gestionnaire')
                          : `${property.houses.length} ${property.houses.length === 1 ? text('house', 'maison') : text('houses', 'maisons')}`}
                      </span>
                    </span>
                  </label>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
              <Button disabled={saving || assignableProperties.length === 0} loading={saving} icon={<Save className="h-4 w-4" />} onClick={saveAssignments}>
                {text('Save assignments', 'Enregistrer les attributions')}
              </Button>
            </div>
          </section>
        </div>
      )}
      {staffForm !== undefined && (
        <StaffIdentityForm
          key={staffForm?.id ?? 'new-property-manager'}
          role="property_manager"
          houses={houses}
          properties={properties}
          unavailableHouseIds={unavailableHouseIdsForForm}
          initialProfile={staffForm}
          initialHouseIds={staffForm ? assignments[staffForm.id] ?? [] : []}
          onClose={() => setStaffForm(undefined)}
          onSaved={() => setRefreshKey(key => key + 1)}
        />
      )}
    </div>
  );
}
