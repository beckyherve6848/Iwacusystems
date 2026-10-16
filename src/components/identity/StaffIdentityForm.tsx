import React, { useEffect, useState } from 'react';
import { supabase, Profile } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PrivateDocumentLink from '@/components/identity/PrivateDocumentLink';
import { hasExactImageDimensions, imageFileExtension, isPngOrJpeg } from '@/lib/identityFiles';
import { useTheme } from '@/contexts/ThemeContext';

export interface StaffHouse {
  id: string;
  house_number: string;
  property_id: string | null;
  property_name: string;
  status: string;
}

export interface StaffProperty {
  id: string;
  name: string;
}

type StaffProfile = Profile & {
  staff_id?: string | null;
  national_id?: string | null;
  residential_address?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

interface Props {
  role: 'caretaker' | 'property_manager';
  houses: StaffHouse[];
  properties: StaffProperty[];
  unavailableHouseIds?: string[];
  initialProfile?: StaffProfile | null;
  initialHouseIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const EMPTY_HOUSE_IDS: string[] = [];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>;
    const message = [details.message, details.details, details.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ');
    if (message) return message;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      return 'An unrecognized error occurred while saving staff details.';
    }
  }
  return 'Unable to save staff details.';
}

export default function StaffIdentityForm({
  role,
  houses,
  properties,
  unavailableHouseIds = [],
  initialProfile,
  initialHouseIds = EMPTY_HOUSE_IDS,
  onClose,
  onSaved,
}: Props) {
  const { language } = useTheme();
  const text = (english: string, french: string) => language === 'fr' ? french : english;
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '');
  const [staffId, setStaffId] = useState(initialProfile?.staff_id ?? '');
  const [nationalId, setNationalId] = useState(initialProfile?.national_id ?? '');
  const [phone, setPhone] = useState(initialProfile?.phone ?? '');
  const [email, setEmail] = useState(initialProfile?.email ?? '');
  const [address, setAddress] = useState(initialProfile?.residential_address ?? '');
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialProfile?.assigned_property_group_id ?? '');
  const [selectedHouses, setSelectedHouses] = useState<string[]>(
    initialHouseIds,
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);
  const [createdStaffId, setCreatedStaffId] = useState<string | null>(null);
  const [currentPhotoPath, setCurrentPhotoPath] = useState(initialProfile?.profile_photo_path ?? null);
  const [currentDocumentPath, setCurrentDocumentPath] = useState(initialProfile?.identity_document_path ?? null);
  const [currentSignaturePath, setCurrentSignaturePath] = useState(initialProfile?.signature_image_path ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStaffId(initialProfile?.staff_id ?? '');
    setSelectedPropertyId(initialProfile?.assigned_property_group_id ?? '');
    setSelectedHouses(initialHouseIds);
  }, [initialProfile, initialHouseIds]);

  const chooseFile = async (file: File | undefined, kind: 'photo' | 'document' | 'signature') => {
    if (!file) return;
    const valid = kind === 'photo'
      ? isPngOrJpeg(file) && file.size <= MAX_PHOTO_BYTES
      : kind === 'signature'
        ? (isPngOrJpeg(file) || file.type === 'image/svg+xml') && file.size <= 1024 * 1024
        : (file.type === 'application/pdf' || isPngOrJpeg(file)) && file.size <= MAX_DOCUMENT_BYTES;
    if (!valid) {
      setError(kind === 'photo'
        ? text('Choose a PNG or JPG/JPEG image up to 5 MB.', 'Choisissez une image PNG ou JPG/JPEG de 5 Mo maximum.')
        : kind === 'signature'
          ? text('Choose an SVG, PNG, or JPG/JPEG signature image up to 1 MB.', 'Choisissez une signature au format SVG, PNG ou JPG/JPEG de 1 Mo maximum.')
          : text('Choose a PDF up to 10 MB, or a 500 × 500 PNG/JPG image up to 10 MB.', 'Choisissez un PDF de 10 Mo maximum ou une image PNG/JPG de 500 × 500 pixels et de 10 Mo maximum.'));
      return;
    }
    if (kind === 'document' && isPngOrJpeg(file)) {
      try {
        if (!await hasExactImageDimensions(file, 500, 500)) {
          setError(text('ID/passport images must be exactly 500 × 500 pixels.', 'Les images de carte d’identité/passeport doivent mesurer exactement 500 × 500 pixels.'));
          return;
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The selected ID/passport image could not be checked.');
        return;
      }
    }
    setError(null);
    if (kind === 'photo') setPhoto(file);
    else if (kind === 'signature') setSignature(file);
    else setDocument(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (role === 'caretaker'
      ? !houses.some(house => house.property_id === selectedPropertyId)
      : selectedHouses.length === 0) {
      setError(role === 'caretaker'
        ? text('Assign a property to this caretaker.', 'Attribuez un bien immobilier à ce concierge.')
        : text('Assign at least one available house.', 'Attribuez au moins une maison disponible.'));
      return;
    }
    setSaving(true);

    let profileId = initialProfile?.id ?? createdProfileId ?? undefined;
    let createdProfileThisSave = false;
    const uploadedPaths: string[] = [];
    let filesLinked = false;
    try {
      if (profileId) {
        const selectedProperty = properties.find(property => property.id === selectedPropertyId);
        const caretakerHouses = role === 'caretaker'
          ? houses.filter(house => house.property_id === selectedPropertyId)
          : [];
        const profileUpdate = await supabase.from('profiles').update({
          full_name: fullName.trim(),
          national_id: nationalId.trim(),
          staff_id: staffId.trim() || createdStaffId || initialProfile?.staff_id || null,
          phone: phone.trim(),
          email: email.trim(),
          role,
          ...(role === 'caretaker' ? { is_active: true } : {}),
          residential_address: address.trim(),
          ...(role === 'caretaker' ? {
            assigned_property_group_id: selectedPropertyId,
            assigned_property_id: caretakerHouses[0]?.id ?? null,
            assigned_property_name: selectedProperty?.name ?? null,
          } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', profileId);
        if (profileUpdate.error) throw profileUpdate.error;
        if (role === 'property_manager') {
          const { error: assignmentError } = await supabase.rpc('assign_property_manager_houses', {
            target_manager_id: profileId,
            target_house_ids: selectedHouses,
          });
          if (assignmentError) throw assignmentError;
        }
      } else {
        const { data, error: createError } = await supabase.functions.invoke('admin-create-staff', {
          body: {
            role,
            fullName: fullName.trim(),
            ...(staffId.trim() ? { staffId: staffId.trim() } : {}),
            nationalId: nationalId.trim(),
            phone: phone.trim(),
            email: email.trim(),
            residentialAddress: address.trim(),
            ...(role === 'property_manager' ? { houseIds: selectedHouses } : { propertyId: selectedPropertyId }),
          },
        });
        if (createError) {
          let detail = createError.message;
          if (createError.context instanceof Response) {
            const responseBody = await createError.context.clone().json().catch(() => null);
            if (typeof responseBody?.error === 'string') detail = responseBody.error;
          }
          throw new Error(detail);
        }
        if (data?.error) throw new Error(data.error);
        if (!data?.id) throw new Error('Staff invitation succeeded without returning the new profile ID.');
        profileId = data.id;
        createdProfileThisSave = true;
        setCreatedProfileId(data.id);
        setCreatedStaffId(data.staffId ?? null);
        if (data.staffId) setStaffId(data.staffId);
      }

      if (!profileId) throw new Error('The staff profile ID is unavailable.');
      const newPaths: { profile_photo_path?: string; identity_document_path?: string; signature_image_path?: string } = {};
      const upload = async (file: File, kind: 'photo' | 'identity' | 'signature') => {
        const extension = file.type === 'application/pdf' ? 'pdf' : imageFileExtension(file);
        const path = `staff/${profileId}/${kind}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('identity-documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        return path;
      };
      if (photo) newPaths.profile_photo_path = await upload(photo, 'photo');
      if (document) newPaths.identity_document_path = await upload(document, 'identity');
      if (signature) newPaths.signature_image_path = await upload(signature, 'signature');
      if (Object.keys(newPaths).length > 0) {
        const { error: pathError } = await supabase.from('profiles')
          .update(newPaths)
          .eq('id', profileId);
        if (pathError) throw pathError;
        filesLinked = true;
        if (newPaths.profile_photo_path) setCurrentPhotoPath(newPaths.profile_photo_path);
        if (newPaths.identity_document_path) setCurrentDocumentPath(newPaths.identity_document_path);
        if (newPaths.signature_image_path) setCurrentSignaturePath(newPaths.signature_image_path);
        const oldPaths = [
          photo ? currentPhotoPath : null,
          document ? currentDocumentPath : null,
          signature ? currentSignaturePath : null,
        ].filter((path): path is string => Boolean(path));
        if (oldPaths.length) {
          const { error: removeError } = await supabase.storage.from('identity-documents').remove(oldPaths);
          if (removeError) throw new Error(`New files were saved, but old files could not be removed: ${removeError.message}`);
        }
      }

      onSaved();
      onClose();
    } catch (caught) {
      let message = getErrorMessage(caught);
      if (caught && typeof caught === 'object' && 'code' in caught && caught.code === '23505') {
        message = 'That Staff ID is already in use. Choose a different Staff ID.';
      }
      if (message.includes('infinite recursion detected in policy for relation "profiles"')) {
        message = 'Database setup needs an update: apply migration 20261012123000_fix_profiles_rls_recursion.sql with `npm run supabase:push`, then retry saving staff details.';
      }
      if (!filesLinked && uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from('identity-documents').remove(uploadedPaths);
        if (cleanupError) message = `${message}; temporary uploads could not be removed: ${cleanupError.message}`;
      }
      setError(createdProfileThisSave
        ? `The invitation was created, but staff setup is incomplete: ${message}. You can retry saving this form.`
        : message);
      if (profileId) onSaved();
    } finally {
      setSaving(false);
    }
  };

  const isSavedProfile = Boolean(initialProfile || createdProfileId);
  const title = role === 'caretaker'
    ? isSavedProfile ? text('Edit Caretaker', 'Modifier le concierge') : text('Add Caretaker', 'Ajouter un concierge')
    : isSavedProfile ? text('Edit Property Manager', 'Modifier le gestionnaire immobilier') : text('Add Property Manager', 'Ajouter un gestionnaire immobilier');

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <form onSubmit={save} className="space-y-5">
        {!isSavedProfile && (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
            {text('Supabase will email a secure invitation link. Enter a preferred Staff ID below, or leave it blank to generate one automatically.', 'Supabase enverra un lien d’invitation sécurisé par e-mail. Saisissez un identifiant de personnel ou laissez le champ vide pour en générer un automatiquement.')}
          </p>
        )}
        {(initialProfile?.staff_id || createdStaffId) && (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            {text('Staff ID', 'Identifiant du personnel')} : <strong>{initialProfile?.staff_id ?? createdStaffId}</strong>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={text('Full name', 'Nom complet')} required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} />
          <div>
            <Input
              label={text('Preferred Staff ID', 'Identifiant du personnel souhaité')}
              maxLength={40}
              value={staffId}
              onChange={event => setStaffId(event.target.value)}
              placeholder={text('e.g. PM-001', 'ex. PM-001')}
            />
            <p className="mt-1 text-xs text-slate-500">{text('Leave blank to use the automatically generated Staff ID.', 'Laissez vide pour utiliser l’identifiant généré automatiquement.')}</p>
          </div>
          <Input label={text('National ID / Passport number', 'Numéro de carte nationale / passeport')} required maxLength={80} value={nationalId} onChange={event => setNationalId(event.target.value)} />
          <Input label={text('Telephone', 'Téléphone')} required type="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} />
          <Input label={text('Email address', 'Adresse e-mail')} required type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={isSavedProfile} />
          <Input label={text('Residential address', 'Adresse du domicile')} required maxLength={300} value={address} onChange={event => setAddress(event.target.value)} />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">
            {role === 'caretaker' ? text('Property managed by this caretaker', 'Bien immobilier géré par ce concierge') : text('Houses assigned to this manager', 'Maisons attribuées à ce gestionnaire')}
          </legend>
          {role === 'caretaker' ? (
            properties.length === 0 || !properties.some(property => houses.some(house => house.property_id === property.id)) ? (
              <p className="text-sm text-amber-700">{text('Create a property and assign houses to it before adding a caretaker.', 'Créez un bien immobilier et attribuez-lui des maisons avant d’ajouter un concierge.')}</p>
            ) : (
              <div className="space-y-2">
                {properties.map(property => {
                  const propertyHouses = houses.filter(house => house.property_id === property.id);
                  return (
                    <label key={property.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="staff-property"
                        checked={selectedPropertyId === property.id}
                        disabled={propertyHouses.length === 0}
                        onChange={() => setSelectedPropertyId(property.id)}
                      />
                      <span>
                        <strong className="block">{property.name}</strong>
                        <span className="block text-xs text-slate-500">
                          {propertyHouses.length} {propertyHouses.length === 1 ? text('house', 'maison') : text('houses', 'maisons')} : {propertyHouses.map(house => house.house_number).join(', ') || text('No houses assigned', 'Aucune maison attribuée')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )
          ) : houses.length === 0 ? (
            <p className="text-sm text-amber-700">{text('Create a property and add houses before assigning a manager.', 'Créez un bien immobilier et ajoutez-y des maisons avant d’attribuer un gestionnaire.')}</p>
          ) : houses.map(house => {
            const unavailable = unavailableHouseIds.includes(house.id) && !selectedHouses.includes(house.id);
            return (
            <label key={house.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="staff-property"
                checked={selectedHouses.includes(house.id)}
                disabled={unavailable}
                onChange={() => setSelectedHouses(current =>
                  current.includes(house.id) ? current.filter(id => id !== house.id) : [...current, house.id])}
              />
              <span>
                <span className="block font-medium">{house.property_name} · {text('House', 'Maison')} {house.house_number}</span>
                <span className="block text-xs text-slate-500">
                  {unavailable ? text('Assigned to another property manager', 'Attribuée à un autre gestionnaire immobilier') : `${text('Status', 'Statut')} : ${house.status === 'vacant' ? text('Vacant', 'Libre') : house.status === 'occupied' ? text('Occupied', 'Occupée') : house.status === 'reserved' ? text('Reserved', 'Réservée') : house.status === 'maintenance' ? text('Maintenance', 'En maintenance') : house.status}`}
                </span>
              </span>
            </label>
          );
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            {text('Profile photo (PNG/JPG/JPEG, max 5 MB)', 'Photo de profil (PNG/JPG/JPEG, 5 Mo max.)')}
            <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={event => chooseFile(event.target.files?.[0], 'photo')} className="block w-full text-sm" />
            {currentPhotoPath && <PrivateDocumentLink path={currentPhotoPath} label={text('current profile photo', 'photo de profil actuelle')} />}
            {photo && <span className="block text-xs text-slate-500">{text('Selected:', 'Sélectionné :')} {photo.name}</span>}
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            {text('ID card / Passport (PDF or 500 × 500 PNG/JPG, max 10 MB)', 'Carte d’identité / Passeport (PDF ou PNG/JPG de 500 × 500, 10 Mo max.)')}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event => { void chooseFile(event.target.files?.[0], 'document'); }} className="block w-full text-sm" />
            {currentDocumentPath && <PrivateDocumentLink path={currentDocumentPath} label={text('current ID / Passport', 'carte d’identité / passeport actuel')} />}
            {document && <span className="block text-xs text-slate-500">{text('Selected:', 'Sélectionné :')} {document.name}</span>}
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            {text('Signature image', 'Image de signature')}
            <span className="block text-xs font-normal text-slate-500">{text('SVG or transparent PNG recommended; at least 300 × 100 px; maximum 1 MB.', 'Format SVG ou PNG transparent recommandé ; au moins 300 × 100 px ; 1 Mo maximum.')}</span>
            <input type="file" accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg" onChange={event => { void chooseFile(event.target.files?.[0], 'signature'); }} className="block w-full text-sm" />
            {currentSignaturePath && <PrivateDocumentLink path={currentSignaturePath} label={text('current signature', 'signature actuelle')} />}
            {signature && <span className="block text-xs text-slate-500">{text('Selected:', 'Sélectionné :')} {signature.name}</span>}
          </label>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>{text('Cancel', 'Annuler')}</Button>
          <Button
            type="submit"
            loading={saving}
            disabled={role === 'caretaker'
              ? !properties.some(property => houses.some(house => house.property_id === property.id))
              : houses.length === 0}
          >
            {isSavedProfile ? text('Save staff details', 'Enregistrer les informations du personnel') : text('Create staff account', 'Créer le compte du personnel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
