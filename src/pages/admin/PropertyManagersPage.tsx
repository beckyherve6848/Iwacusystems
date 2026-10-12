import React, { useEffect, useState } from 'react';
import { Building, Check, Clock, Pencil, Plus, Save } from 'lucide-react';
import { Profile, supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import StaffIdentityForm, { StaffHouse, StaffProperty } from '@/components/identity/StaffIdentityForm';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';

type Manager = Profile & {
  national_id?: string | null;
  residential_address?: string | null;
  staff_id?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

export default function PropertyManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [houses, setHouses] = useState<StaffHouse[]>([]);
  const [properties, setProperties] = useState<StaffProperty[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedHouses, setSelectedHouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [staffForm, setStaffForm] = useState<Manager | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const load = async () => {
    setLoading(true);
    const [managerResult, houseResult, propertyResult, assignmentResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, role, is_active, created_at, staff_id, national_id, residential_address, profile_photo_path, identity_document_path, assigned_property_id, assigned_property_name')
        .eq('role', 'property_manager').order('created_at', { ascending: false }),
      supabase.from('houses').select('id, house_number, status, property_id').order('house_number'),
      supabase.from('properties').select('id, name').order('name'),
      supabase.from('property_manager_houses').select('manager_id, house_id'),
    ]);
    const error = managerResult.error ?? houseResult.error ?? propertyResult.error ?? assignmentResult.error;
    if (error) {
      const loadError = error.message.includes('property_manager_houses')
        ? 'Property Manager database setup is incomplete. Apply the full supabase/migrations/20261011140000_add_property_manager_role.sql migration in Supabase SQL Editor, then refresh this page.'
        : error.message.includes('properties') || error.message.includes('property_id')
          ? 'Property and house assignments are not installed yet. Apply supabase/migrations/20261012112000_add_property_and_house_assignments.sql in Supabase SQL Editor, then refresh this page.'
        : `Unable to load property managers: ${error.message}`;
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
        property_name: house.property_id ? propertyNameById.get(house.property_id) ?? 'Unassigned property' : 'Unassigned property',
      })));
      setAssignments(loadedAssignments);
      const initialManager = loadedManagers[0]?.id ?? '';
      setSelectedManager(initialManager);
      setSelectedHouses(loadedAssignments[initialManager] ?? []);
    }
    setLoading(false);
    };
    load();
  }, [addToast, refreshKey]);

  const chooseManager = (id: string) => {
    setSelectedManager(id);
    setSelectedHouses(assignments[id] ?? []);
  };

  const toggleHouse = (id: string) => {
    const ownedByOtherManager = Object.entries(assignments).some(([managerId, houseIds]) =>
      managerId !== selectedManager && houseIds.includes(id));
    if (ownedByOtherManager) {
      addToast('This house is already assigned to another property manager.', 'error');
      return;
    }
    setSelectedHouses(current => current.includes(id)
      ? current.filter(houseId => houseId !== id)
      : [...current, id]);
  };

  const saveAssignments = async () => {
    if (!selectedManager) return;
    setSaving(true);
    const { error } = await supabase.rpc('assign_property_manager_houses', {
      target_manager_id: selectedManager,
      target_house_ids: selectedHouses,
    });
    if (error) {
      addToast(`Unable to save property assignments: ${error.message}`, 'error');
    } else {
      addToast('Property assignments saved. Account access updated.', 'success');
      setAssignments(current => ({ ...current, [selectedManager]: selectedHouses }));
      setManagers(current => current.map(manager => manager.id === selectedManager
        ? { ...manager, is_active: selectedHouses.length > 0 }
        : manager));
    }
    setSaving(false);
  };

  const manager = managers.find(item => item.id === selectedManager);
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
            <h1 className="text-2xl font-bold text-slate-900">Property Managers</h1>
            <p className="mt-1 text-sm text-slate-500">Manage staff identity details, documents, and assigned properties.</p>
          </div>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setStaffForm(null)}>Add Property Manager</Button>
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading property managers...</div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Unable to load property managers: {loadError}
        </div>
      ) : managers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No Property Manager registrations yet.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <section className="space-y-3">
            {managers.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseManager(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  selectedManager === item.id ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{item.full_name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.email}</p>
                    {item.phone && <p className="mt-0.5 text-xs text-slate-500">{item.phone}</p>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {item.is_active ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {item.is_active ? 'Approved' : 'Pending'}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {(assignments[item.id] ?? []).length} assigned {(assignments[item.id] ?? []).length === 1 ? 'property' : 'properties'}
                </p>
              </button>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Building className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">{manager?.full_name}</h2>
                <p className="text-sm text-slate-500">Choose available houses under their properties. Each house can be assigned to only one property manager.</p>
              </div>
            </div>
            {manager && (
              <>
                <StaffIdentityCard
                  profile={manager}
                  assignedProperties={(assignments[manager.id] ?? [])
                    .map(id => {
                      const house = houses.find(item => item.id === id);
                      return house ? `${house.property_name} · ${house.house_number}` : null;
                    })
                    .filter((name): name is string => Boolean(name))}
                />
                <Button
                  variant="outline"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => setStaffForm(manager)}
                  className="my-4"
                >
                  Edit identity and documents
                </Button>
              </>
            )}
            {houses.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Create properties and add houses before approving a manager.</p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {houses.map(house => (
                  <label key={house.id} className={`flex items-center gap-3 rounded-xl border border-slate-100 p-3 ${unavailableHouseIds.includes(house.id) && !selectedHouses.includes(house.id) ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={selectedHouses.includes(house.id)}
                      disabled={unavailableHouseIds.includes(house.id) && !selectedHouses.includes(house.id)}
                      onChange={() => toggleHouse(house.id)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{house.property_name} · House {house.house_number}</span>
                      <span className="block text-xs capitalize text-slate-500">
                        {unavailableHouseIds.includes(house.id) && !selectedHouses.includes(house.id) ? 'Assigned to another manager' : house.status}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
              <Button disabled={saving || houses.length === 0} loading={saving} icon={<Save className="h-4 w-4" />} onClick={saveAssignments}>
                Save assignments
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
