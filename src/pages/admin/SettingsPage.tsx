import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Input, { Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Save, Settings, Upload, Image as ImageIcon, Plus, Trash2, Smartphone, Sun, Moon, Eye, Check } from 'lucide-react';
import { DEFAULT_STAFF_CARD_FOOTER, DEFAULT_STAFF_CARD_FOOTER_FR, useTheme } from '@/contexts/ThemeContext';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';
import {
  ADMIN_OVERVIEW_QUOTE_COLORS,
  AdminOverviewPhotoQuote,
  countAdminOverviewQuoteWords,
  createEmptyOverviewQuotes,
  MAX_ADMIN_OVERVIEW_QUOTE_WORDS,
  parseAdminOverviewPhotoQuotes,
} from '@/lib/adminOverviewQuotes';
import {
  getThemeModeForCurrentDevice,
  getThemeModeForDevice,
  isPhoneViewport,
  PhoneThemeMode,
  saveThemeModeForDevice,
} from '@/lib/phoneThemeMode';

const MAX_OVERVIEW_PHOTO_SIZE = 3 * 1024 * 1024;
const OVERVIEW_PHOTO_WIDTH = 1200;
const OVERVIEW_PHOTO_HEIGHT = 800;
const OVERVIEW_PHOTO_COUNT = 5;

type OverviewPhotoFormat = {
  contentType: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'png';
};

function resizeOverviewQuoteField(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight + 2}px`;
}

async function validateOverviewPhoto(blob: Blob, language: string): Promise<OverviewPhotoFormat> {
  const isFrench = language === 'fr';
  if (blob.size > MAX_OVERVIEW_PHOTO_SIZE) {
    throw new Error(isFrench ? 'La taille maximale est de 3 Mo par photo.' : 'Photo must be 3 MB or smaller.');
  }
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const isPng = signature.length === 8
    && signature[0] === 0x89
    && signature[1] === 0x50
    && signature[2] === 0x4e
    && signature[3] === 0x47
    && signature[4] === 0x0d
    && signature[5] === 0x0a
    && signature[6] === 0x1a
    && signature[7] === 0x0a;
  const isJpeg = signature.length >= 3
    && signature[0] === 0xff
    && signature[1] === 0xd8
    && signature[2] === 0xff;
  const format: OverviewPhotoFormat | null = isPng
    ? { contentType: 'image/png', extension: 'png' }
    : isJpeg
      ? { contentType: 'image/jpeg', extension: 'jpg' }
      : null;
  if (!format || (blob.type && blob.type !== format.contentType)) {
    throw new Error(isFrench ? 'La photo doit être une véritable image JPG ou PNG.' : 'Photo must be a genuine JPG or PNG image.');
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(blob);
  } catch {
    throw new Error(isFrench ? 'La photo JPG ou PNG est invalide ou illisible.' : 'Photo is not a valid, readable JPG or PNG image.');
  }
  try {
    if (image.width !== OVERVIEW_PHOTO_WIDTH || image.height !== OVERVIEW_PHOTO_HEIGHT) {
      throw new Error(isFrench
        ? `La photo doit mesurer exactement ${OVERVIEW_PHOTO_WIDTH} × ${OVERVIEW_PHOTO_HEIGHT} px au format horizontal.`
        : `Photo must be exactly ${OVERVIEW_PHOTO_WIDTH} × ${OVERVIEW_PHOTO_HEIGHT} px in landscape.`);
    }
    return format;
  } finally {
    image.close();
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState('/iwacu-mark-512.png');
  const [familyPreview, setFamilyPreview] = useState('/Bck.png');
  const [overviewPhotos, setOverviewPhotos] = useState<string[]>([]);
  const [overviewQuotes, setOverviewQuotes] = useState<AdminOverviewPhotoQuote[]>(createEmptyOverviewQuotes);
  const [savedOverviewQuotes, setSavedOverviewQuotes] = useState<AdminOverviewPhotoQuote[]>(createEmptyOverviewQuotes);
  const [savingQuoteIndex, setSavingQuoteIndex] = useState<number | null>(null);
  const [overviewPhotoPreview, setOverviewPhotoPreview] = useState<string | null>(null);
  const [phoneThemeMode, setPhoneThemeMode] = useState<PhoneThemeMode>(() => getThemeModeForCurrentDevice());
  const [isPhoneDevice, setIsPhoneDevice] = useState(() => isPhoneViewport());
  const logoFileRef = useRef<HTMLInputElement>(null);
  const familyFileRef = useRef<HTMLInputElement>(null);
  const overviewPhotosFileRef = useRef<HTMLInputElement>(null);
  const overviewPhotoReplaceRef = useRef<HTMLInputElement>(null);
  const overviewPhotoReplaceIndex = useRef<number | null>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { updateBranding, t, language, loginFamilyImageUrl } = useTheme();

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 767px)');
    const updateDevice = () => {
      setIsPhoneDevice(viewport.matches);
      setPhoneThemeMode(getThemeModeForDevice(viewport.matches ? 'phone' : 'desktop'));
    };
    updateDevice();
    viewport.addEventListener('change', updateDevice);
    return () => viewport.removeEventListener('change', updateDevice);
  }, []);

  useEffect(() => {
    supabase.from('settings').select('key, value').then(({ data, error }) => {
      if (error) {
        addToast(`${t('unableLoadSettings')}: ${error.message}`, 'error');
        setLoading(false);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach(s => { map[s.key] = s.value ?? ''; });
      try {
        setPaymentMethods(parseCustomPaymentMethods(map.custom_payment_methods));
      } catch (error) {
        addToast(`${t('unableLoadPaymentMethods')}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      setLogoPreview(map.logo_url || '/iwacu-mark-512.png');
      if (map.login_family_image_url) setFamilyPreview(map.login_family_image_url);
      let loadedOverviewPhotos: string[] = [];
      try {
        const parsedPhotos: unknown = map.admin_overview_photos ? JSON.parse(map.admin_overview_photos) : [];
        if (!Array.isArray(parsedPhotos) || !parsedPhotos.every(photo => typeof photo === 'string') || parsedPhotos.length > 5) {
          throw new Error('Overview photo setting must contain up to five image URLs.');
        }
        loadedOverviewPhotos = parsedPhotos;
      } catch (error) {
        addToast(`Unable to load overview photos: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      setOverviewPhotos(loadedOverviewPhotos);
      let loadedOverviewQuotes = createEmptyOverviewQuotes();
      try {
        loadedOverviewQuotes = parseAdminOverviewPhotoQuotes(
          map.admin_overview_photo_quotes ? JSON.parse(map.admin_overview_photo_quotes) : undefined,
        );
      } catch (error) {
        addToast(`Unable to load overview photo quotes: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      setOverviewQuotes(loadedOverviewQuotes);
      setSavedOverviewQuotes(loadedOverviewQuotes);
      setSettings({
        ...map,
        app_name: map.app_name || 'Iwacusystem',
        logo_url: map.logo_url || '/iwacu-mark-512.png',
        staff_card_footer: map.staff_card_footer || DEFAULT_STAFF_CARD_FOOTER,
        staff_card_footer_fr: map.staff_card_footer_fr || DEFAULT_STAFF_CARD_FOOTER_FR,
        login_family_image_url: map.login_family_image_url || '',
        admin_overview_photos: JSON.stringify(loadedOverviewPhotos),
        admin_overview_photo_quotes: JSON.stringify(loadedOverviewQuotes),
      });
      setLoading(false);
    });
  }, [addToast, t]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [key]: e.target.value }));

  const updateOverviewQuote = (index: number, patch: Partial<AdminOverviewPhotoQuote>) => {
    setOverviewQuotes(current => current.map((quote, quoteIndex) =>
      quoteIndex === index ? { ...quote, ...patch } : quote,
    ));
  };

  const saveOverviewQuote = async (index: number) => {
    const quote = overviewQuotes[index];
    if (overviewPhotos.length > 0 && overviewPhotos.length < 3) {
      addToast(language === 'fr'
        ? 'Ajoutez au moins trois photos à la galerie avant d’enregistrer les citations.'
        : 'Add at least three photos to the gallery before saving quotes.', 'error');
      return;
    }
    if (!quote || countAdminOverviewQuoteWords(quote.text) > MAX_ADMIN_OVERVIEW_QUOTE_WORDS) {
      addToast(language === 'fr'
        ? 'La citation doit contenir au maximum 15 mots.'
        : 'The quote can contain no more than 15 words.', 'error');
      return;
    }

    setSavingQuoteIndex(index);
    try {
      const quotesToSave = savedOverviewQuotes.map((savedQuote, quoteIndex) =>
        quoteIndex === index ? quote : savedQuote,
      );
      const { error } = await supabase.from('settings').upsert({
        key: 'admin_overview_photo_quotes',
        value: JSON.stringify(quotesToSave),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) {
        addToast(`${language === 'fr' ? 'Impossible d’enregistrer la citation' : 'Unable to save the quote'}: ${error.message}`, 'error');
        return;
      }

      setSavedOverviewQuotes(quotesToSave);
      setSettings(current => ({
        ...current,
        admin_overview_photo_quotes: JSON.stringify(quotesToSave),
      }));
      updateBranding({ adminOverviewPhotoQuotes: quotesToSave });
      addToast(language === 'fr' ? 'Citation enregistrée.' : 'Quote saved.', 'success');
    } finally {
      setSavingQuoteIndex(null);
    }
  };

  const handleFileUpload = async (file: File, asset: 'logo' | 'family') => {
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
    if (!allowedImageTypes.includes(file.type)) {
      addToast(t('chooseImageTypes'), 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast(t('imageUnder5Mb'), 'error');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${asset}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('login-bg')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (upErr) {
      addToast(upErr.message, 'error');
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from('login-bg').getPublicUrl(path);
    const url = pub.publicUrl;

    const settingKey = asset === 'logo' ? 'logo_url' : 'login_family_image_url';
    setSettings(s => ({ ...s, [settingKey]: url }));
    if (asset === 'logo') setLogoPreview(url);
    else setFamilyPreview(url);
    addToast(t('imageUploadedSave'), 'success');
    setUploading(false);
  };

  const handleOverviewPhotosUpload = async (fileList: FileList | null, replaceIndex?: number) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (overviewQuotes.some(quote => countAdminOverviewQuoteWords(quote.text) > MAX_ADMIN_OVERVIEW_QUOTE_WORDS)) {
      addToast(language === 'fr'
        ? 'Chaque citation de photo doit contenir au maximum 15 mots.'
        : 'Each photo quote can contain no more than 15 words.', 'error');
      return;
    }
    if (replaceIndex !== undefined && files.length !== 1) {
      addToast(language === 'fr' ? 'Sélectionnez une seule photo à remplacer.' : 'Select one photo to replace.', 'error');
      return;
    }
    const previousPhotos = [...overviewPhotos];
    const previousPhotoUrl = replaceIndex === undefined ? undefined : previousPhotos[replaceIndex];
    const previousPhotoLocation = previousPhotoUrl ? getOverviewPhotoStorageLocation(previousPhotoUrl) : null;
    if (replaceIndex !== undefined && (!previousPhotoUrl || !previousPhotoLocation)) {
      addToast(language === 'fr'
        ? 'Impossible de déterminer le chemin de stockage sécurisé de cette photo. Elle n’a pas été remplacée.'
        : 'Could not determine this photo’s safe storage path. It was not replaced.', 'error');
      return;
    }
    if (replaceIndex !== undefined && !window.confirm(language === 'fr'
      ? 'Remplacer cette photo et supprimer définitivement l’ancienne du stockage Supabase ? Cette action est irréversible.'
      : 'Replace this photo and permanently delete the old one from Supabase Storage? This cannot be undone.')) return;
    if (replaceIndex === undefined && overviewPhotos.length + files.length > 5) {
      addToast(language === 'fr'
        ? 'La galerie ne peut pas contenir plus de cinq photos.'
        : 'The gallery can contain no more than five photos.', 'error');
      return;
    }
    const resultingPhotoCount = replaceIndex === undefined
      ? overviewPhotos.length + files.length
      : overviewPhotos.length;
    if (resultingPhotoCount > 0 && resultingPhotoCount < 3) {
      addToast(language === 'fr'
        ? 'Ajoutez au moins trois photos avant d’enregistrer la galerie.'
        : 'Add at least three photos before saving the gallery.', 'error');
      return;
    }
    const validatedFiles: { file: File; format: OverviewPhotoFormat }[] = [];
    for (const file of files) {
      try {
        validatedFiles.push({ file, format: await validateOverviewPhoto(file, language) });
      } catch (error) {
        addToast(`${file.name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return;
      }
    }

    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      let uploadedPhotos = [...overviewPhotos];
      const uploadedQuotes = [...overviewQuotes];
      if (replaceIndex !== undefined && previousPhotoLocation) {
        const { file, format } = validatedFiles[0];
        const replacementPath = `overview-${crypto.randomUUID()}-replacement.${format.extension}`;
        const { error: uploadError } = await supabase.storage
          .from('dashboard-gallery')
          .upload(replacementPath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: format.contentType,
          });
        if (uploadError) {
          addToast(`Unable to upload ${file.name}: ${uploadError.message}`, 'error');
          return;
        }

        const { data } = supabase.storage.from('dashboard-gallery').getPublicUrl(replacementPath);
        uploadedPhotos[replaceIndex] = data.publicUrl;
        const { error: settingsError } = await supabase.from('settings').upsert([
          {
            key: 'admin_overview_photos',
            value: JSON.stringify(uploadedPhotos),
            updated_at: new Date().toISOString(),
          },
          {
            key: 'admin_overview_photo_quotes',
            value: JSON.stringify(uploadedQuotes),
            updated_at: new Date().toISOString(),
          },
        ], { onConflict: 'key' });
        if (settingsError) {
          const { error: cleanupError } = await supabase.storage.from('dashboard-gallery').remove([replacementPath]);
          addToast(`${language === 'fr' ? 'Impossible de mettre à jour la galerie' : 'Unable to update the gallery'}: ${settingsError.message}`, 'error');
          if (cleanupError) {
            addToast(`${language === 'fr' ? 'Impossible de supprimer la nouvelle photo du stockage' : 'Unable to remove the new photo from storage'}: ${cleanupError.message}`, 'error');
          }
          return;
        }

        const { error: deleteError } = await supabase.storage
          .from(previousPhotoLocation.bucket)
          .remove([previousPhotoLocation.path]);
        if (deleteError) {
          const { error: rollbackError } = await supabase.from('settings').upsert([
            {
              key: 'admin_overview_photos',
              value: JSON.stringify(previousPhotos),
              updated_at: new Date().toISOString(),
            },
            {
              key: 'admin_overview_photo_quotes',
              value: JSON.stringify(overviewQuotes),
              updated_at: new Date().toISOString(),
            },
          ], { onConflict: 'key' });
          addToast(`${language === 'fr' ? 'Impossible de supprimer l’ancienne photo du stockage' : 'Unable to delete the old photo from storage'}: ${deleteError.message}`, 'error');
          if (rollbackError) {
            setOverviewPhotos(uploadedPhotos);
            setOverviewQuotes(uploadedQuotes);
            setSavedOverviewQuotes(uploadedQuotes);
            setSettings(current => ({
              ...current,
              admin_overview_photos: JSON.stringify(uploadedPhotos),
              admin_overview_photo_quotes: JSON.stringify(uploadedQuotes),
            }));
            updateBranding({ adminOverviewPhotoUrls: uploadedPhotos, adminOverviewPhotoQuotes: uploadedQuotes });
            addToast(`${language === 'fr' ? 'La restauration de la galerie a échoué ; la nouvelle photo reste active' : 'Gallery rollback failed; the replacement photo remains active'}: ${rollbackError.message}`, 'error');
          } else {
            const { error: cleanupError } = await supabase.storage.from('dashboard-gallery').remove([replacementPath]);
            if (cleanupError) {
              addToast(`${language === 'fr' ? 'Impossible de supprimer la nouvelle photo du stockage' : 'Unable to remove the new photo from storage'}: ${cleanupError.message}`, 'error');
            }
          }
          return;
        }

        setOverviewPhotos(uploadedPhotos);
        setOverviewQuotes(uploadedQuotes);
        setSavedOverviewQuotes(uploadedQuotes);
        setSettings(current => ({
          ...current,
          admin_overview_photos: JSON.stringify(uploadedPhotos),
          admin_overview_photo_quotes: JSON.stringify(uploadedQuotes),
        }));
        updateBranding({ adminOverviewPhotoUrls: uploadedPhotos, adminOverviewPhotoQuotes: uploadedQuotes });
        addToast(language === 'fr'
          ? 'Photo remplacée ; l’ancienne a été supprimée du stockage Supabase.'
          : 'Photo replaced; the old photo was deleted from Supabase Storage.', 'success');
        return;
      }

      for (const [index, { file, format }] of validatedFiles.entries()) {
        const path = `overview-${crypto.randomUUID()}-${index}.${format.extension}`;
        const { error } = await supabase.storage
          .from('dashboard-gallery')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: format.contentType,
          });
        if (error) throw new Error(`Unable to upload ${file.name}: ${error.message}`);
        uploadedPaths.push(path);
        const { data } = supabase.storage.from('dashboard-gallery').getPublicUrl(path);
        if (replaceIndex !== undefined) {
          uploadedPhotos[replaceIndex] = data.publicUrl;
        } else {
          uploadedPhotos = [...uploadedPhotos, data.publicUrl];
        }
      }

      const { error: settingsError } = await supabase.from('settings').upsert([
        {
          key: 'admin_overview_photos',
          value: JSON.stringify(uploadedPhotos),
          updated_at: new Date().toISOString(),
        },
        {
          key: 'admin_overview_photo_quotes',
          value: JSON.stringify(uploadedQuotes),
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: 'key' });
      if (settingsError) throw new Error(`Unable to save the overview gallery: ${settingsError.message}`);

      setOverviewPhotos(uploadedPhotos);
      setOverviewQuotes(uploadedQuotes);
      setSettings(current => ({
        ...current,
        admin_overview_photos: JSON.stringify(uploadedPhotos),
        admin_overview_photo_quotes: JSON.stringify(uploadedQuotes),
      }));
      updateBranding({ adminOverviewPhotoUrls: uploadedPhotos, adminOverviewPhotoQuotes: uploadedQuotes });
      addToast(language === 'fr' ? 'Galerie enregistrée et tableau de bord mis à jour.' : 'Gallery saved and dashboard updated.', 'success');
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from('dashboard-gallery').remove(uploadedPaths);
        if (cleanupError) {
          addToast(`${language === 'fr' ? 'Impossible de supprimer les photos téléversées après l’échec' : 'Unable to clean up uploaded photos after failure'}: ${cleanupError.message}`, 'error');
        }
      }
      addToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleImportCurrentPhoto = async () => {
    if (overviewPhotos.length > 0) {
      addToast(language === 'fr'
        ? 'Supprimez les photos actuelles avant d’importer la photo courante dans les cinq emplacements.'
        : 'Delete the current gallery photos before importing the current photo into all five slots.', 'error');
      return;
    }

    const confirmed = window.confirm(language === 'fr'
      ? 'Importer la photo actuellement utilisée et en créer cinq copies distinctes dans le stockage Supabase ? Vous pourrez ensuite prévisualiser, remplacer ou supprimer chaque copie.'
      : 'Import the photo currently in use and create five separate copies in Supabase Storage? You can then preview, replace, or delete each copy.');
    if (!confirmed) return;

    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      const response = await fetch(loginFamilyImageUrl || '/Bck.png');
      if (!response.ok) throw new Error(`Unable to load the current photo: ${response.status}`);
      const sourcePhoto = await response.blob();
      const format = await validateOverviewPhoto(sourcePhoto, language);
      const uploadedUrls: string[] = [];
      const importedQuotes = [...overviewQuotes];
      for (let index = 0; index < OVERVIEW_PHOTO_COUNT; index += 1) {
        const path = `overview-${crypto.randomUUID()}-${index}.${format.extension}`;
        const { error } = await supabase.storage
          .from('dashboard-gallery')
          .upload(path, sourcePhoto, { cacheControl: '3600', upsert: false, contentType: format.contentType });
        if (error) throw new Error(`Unable to upload photo copy ${index + 1}: ${error.message}`);
        uploadedPaths.push(path);
        const { data } = supabase.storage.from('dashboard-gallery').getPublicUrl(path);
        uploadedUrls.push(data.publicUrl);
      }

      const { error: settingsError } = await supabase.from('settings').upsert([
        {
          key: 'admin_overview_photos',
          value: JSON.stringify(uploadedUrls),
          updated_at: new Date().toISOString(),
        },
        {
          key: 'admin_overview_photo_quotes',
          value: JSON.stringify(importedQuotes),
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: 'key' });
      if (settingsError) throw new Error(`Unable to save the overview gallery: ${settingsError.message}`);

      setOverviewPhotos(uploadedUrls);
      setSavedOverviewQuotes(importedQuotes);
      setSettings(current => ({
        ...current,
        admin_overview_photos: JSON.stringify(uploadedUrls),
        admin_overview_photo_quotes: JSON.stringify(importedQuotes),
      }));
      updateBranding({ adminOverviewPhotoUrls: uploadedUrls, adminOverviewPhotoQuotes: importedQuotes });
      addToast(language === 'fr'
        ? 'Cinq copies de la photo ont été enregistrées et le tableau de bord a été mis à jour.'
        : 'Five photo copies were saved and the dashboard was updated.', 'success');
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from('dashboard-gallery').remove(uploadedPaths);
        if (cleanupError) {
          addToast(`${language === 'fr' ? 'Le nettoyage des copies incomplètes a échoué' : 'Unable to clean up incomplete photo copies'}: ${cleanupError.message}`, 'error');
        }
      }
      addToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const getOverviewPhotoStorageLocation = (photoUrl: string) => {
    try {
      const { pathname } = new URL(photoUrl);
      const buckets = ['dashboard-gallery', 'login-bg'] as const;
      for (const bucket of buckets) {
        const publicBucketPrefix = `/storage/v1/object/public/${bucket}/`;
        if (!pathname.includes(publicBucketPrefix)) continue;
        const path = decodeURIComponent(pathname.split(publicBucketPrefix)[1] ?? '');
        if (path.startsWith('overview-') && !path.includes('..')) return { bucket, path };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleDeleteOverviewPhoto = async (index: number) => {
    const photoUrl = overviewPhotos[index];
    if (!photoUrl) return;
    if (overviewQuotes.some(quote => countAdminOverviewQuoteWords(quote.text) > MAX_ADMIN_OVERVIEW_QUOTE_WORDS)) {
      addToast(language === 'fr'
        ? 'Chaque citation de photo doit contenir au maximum 15 mots.'
        : 'Each photo quote can contain no more than 15 words.', 'error');
      return;
    }
    const message = language === 'fr'
      ? 'Supprimer définitivement cette photo de la galerie et du stockage Supabase ? Cette action est irréversible.'
      : 'Permanently delete this photo from the gallery and Supabase Storage? This cannot be undone.';
    if (!window.confirm(message)) return;

    const storageLocation = getOverviewPhotoStorageLocation(photoUrl);
    if (!storageLocation) {
      addToast(language === 'fr'
        ? 'Impossible de déterminer le chemin de stockage sécurisé de cette photo. Elle n’a pas été supprimée.'
        : 'Could not determine this photo’s safe storage path. It was not deleted.', 'error');
      return;
    }

    const previousPhotos = [...overviewPhotos];
    const remainingPhotos = previousPhotos.filter((_, photoIndex) => photoIndex !== index);
    const remainingQuotes = overviewQuotes.filter((_, quoteIndex) => quoteIndex !== index);
    remainingQuotes.push(...createEmptyOverviewQuotes().slice(0, 1));
    setUploading(true);
    try {
      const { error: settingsError } = await supabase.from('settings').upsert([
        {
          key: 'admin_overview_photos',
          value: JSON.stringify(remainingPhotos),
          updated_at: new Date().toISOString(),
        },
        {
          key: 'admin_overview_photo_quotes',
          value: JSON.stringify(remainingQuotes),
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: 'key' });
      if (settingsError) {
        addToast(`${language === 'fr' ? 'Impossible de mettre à jour la galerie' : 'Unable to update the gallery'}: ${settingsError.message}`, 'error');
        return;
      }

      const { error: storageError } = await supabase.storage.from(storageLocation.bucket).remove([storageLocation.path]);
      if (storageError) {
        const { error: rollbackError } = await supabase.from('settings').upsert([
          {
            key: 'admin_overview_photos',
            value: JSON.stringify(previousPhotos),
            updated_at: new Date().toISOString(),
          },
          {
            key: 'admin_overview_photo_quotes',
            value: JSON.stringify(overviewQuotes),
            updated_at: new Date().toISOString(),
          },
        ], { onConflict: 'key' });
        addToast(`${language === 'fr' ? 'Impossible de supprimer la photo du stockage' : 'Unable to delete the photo from storage'}: ${storageError.message}`, 'error');
        if (rollbackError) {
          addToast(`${language === 'fr' ? 'La restauration de la galerie a également échoué' : 'Gallery rollback also failed'}: ${rollbackError.message}`, 'error');
        }
        return;
      }

      setOverviewPhotos(remainingPhotos);
      setOverviewQuotes(remainingQuotes);
      setSavedOverviewQuotes(remainingQuotes);
      setSettings(current => ({
        ...current,
        admin_overview_photos: JSON.stringify(remainingPhotos),
        admin_overview_photo_quotes: JSON.stringify(remainingQuotes),
      }));
      updateBranding({ adminOverviewPhotoUrls: remainingPhotos, adminOverviewPhotoQuotes: remainingQuotes });
      addToast(language === 'fr' ? 'Photo supprimée de la galerie et du stockage.' : 'Photo deleted from the gallery and storage.', 'success');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setSettings(s => ({ ...s, logo_url: '/iwacu-mark-512.png' }));
    setLogoPreview('/iwacu-mark-512.png');
    if (logoFileRef.current) logoFileRef.current.value = '';
  };

  const handleRemoveFamilyImage = () => {
    setSettings(s => ({ ...s, login_family_image_url: '' }));
    setFamilyPreview('/Bck.png');
    if (familyFileRef.current) familyFileRef.current.value = '';
  };

  const handleSave = async () => {
    if (!settings.app_name?.trim()) {
      addToast(t('appNameRequired'), 'error');
      return;
    }
    if (overviewPhotos.length > 0 && overviewPhotos.length < 3) {
      addToast(language === 'fr' ? 'La galerie doit contenir au moins trois photos.' : 'The gallery must contain at least three photos.', 'error');
      return;
    }
    if (overviewPhotos.length > 5) {
      addToast(language === 'fr' ? 'La galerie ne peut pas contenir plus de cinq photos.' : 'The gallery can contain no more than five photos.', 'error');
      return;
    }
    if (overviewQuotes.some(quote => countAdminOverviewQuoteWords(quote.text) > MAX_ADMIN_OVERVIEW_QUOTE_WORDS)) {
      addToast(language === 'fr'
        ? 'Chaque citation de photo doit contenir au maximum 15 mots.'
        : 'Each photo quote can contain no more than 15 words.', 'error');
      return;
    }
    setSaving(true);
    const methodsByName = new Set<string>();
    const reservedMethodNames = [
      'cash', 'bank deposit', 'bank_deposit', 'bank transfer', 'bank_transfer', 'mobile money', 'mobile_money',
    ];
    for (const method of paymentMethods) {
      const name = method.name.trim();
      const instructions = method.instructions.trim();
      if (!name || !instructions) {
        addToast(t('paymentMethodNeedsDetails'), 'error');
        setSaving(false);
        return;
      }
      const normalizedName = name.toLocaleLowerCase();
      if (reservedMethodNames.includes(normalizedName)) {
        addToast(`"${name}" ${t('builtInPaymentMethod')}`, 'error');
        setSaving(false);
        return;
      }
      if (methodsByName.has(normalizedName)) {
        addToast(`"${name}" ${t('duplicatePaymentMethod')}`, 'error');
        setSaving(false);
        return;
      }
      methodsByName.add(normalizedName);
    }

    const settingsToSave = {
      ...settings,
      admin_overview_photos: JSON.stringify(overviewPhotos),
      admin_overview_photo_quotes: JSON.stringify(overviewQuotes),
      custom_payment_methods: JSON.stringify(paymentMethods.map(method => ({
        ...method,
        name: method.name.trim(),
        instructions: method.instructions.trim(),
      }))),
    };
    const { error } = await supabase.from('settings').upsert(
      Object.entries(settingsToSave).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })),
      { onConflict: 'key' },
    );
    if (error) {
      addToast(`${t('unableSaveSettings')}: ${error.message}`, 'error');
    } else {
      updateBranding({
        appName: settings.app_name.trim(),
        appLogoUrl: settings.logo_url || '/iwacu-mark-512.png',
        propertyPhone: settings.property_phone ?? '',
        propertyAddress: settings.property_address ?? '',
        staffCardFooter: settings.staff_card_footer || DEFAULT_STAFF_CARD_FOOTER,
        staffCardFooterFr: settings.staff_card_footer_fr || DEFAULT_STAFF_CARD_FOOTER_FR,
        loginBackgroundUrl: settings.login_bg_url ?? '',
        loginFamilyImageUrl: settings.login_family_image_url ?? '',
        adminOverviewPhotoUrls: overviewPhotos,
        adminOverviewPhotoQuotes: overviewQuotes,
      });
      setSavedOverviewQuotes(overviewQuotes);
      setSettings(settingsToSave);
      addToast(t('settingsSavedSuccess'), 'success');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">{t('settingsTitle')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('settingsDescription')}</p>
      </div>

      <div className="max-w-2xl space-y-4">
        <section className="phone-appearance-card rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Smartphone className="h-4 w-4" />
            {t('phoneAppearance')}
          </h3>
          <p className="mb-4 text-xs text-slate-500">{t('phoneAppearanceDescription')}</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'light', label: t('lightMode'), Icon: Sun },
              { value: 'dark', label: t('darkMode'), Icon: Moon },
            ] as const).map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setPhoneThemeMode(option.value);
                  saveThemeModeForDevice(isPhoneDevice ? 'phone' : 'desktop', option.value);
                }}
                aria-pressed={phoneThemeMode === option.value}
                className={`phone-appearance-option flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                  phoneThemeMode === option.value
                    ? 'phone-appearance-option-selected border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <option.Icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* App Branding */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> {t('appBranding')}
          </h3>
          <div className="space-y-4">
            <Input label={t('appNameLabel')} value={settings.app_name ?? 'Iwacusystem'} onChange={set('app_name')} placeholder="Iwacusystem" />
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">{t('appLogo')}</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center p-2">
                  <img src={logoPreview} alt={t('appLogoPreview')} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className="settings-logo-action" disabled={uploading} icon={<Upload className="w-4 h-4" />} onClick={() => logoFileRef.current?.click()}>
                    {t('replaceLogo')}
                  </Button>
                  <Button variant="ghost" size="sm" className="settings-logo-action" onClick={handleRemoveLogo}>{t('useDefault')}</Button>
                </div>
              </div>
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file, 'logo');
              }} />
            </div>
          </div>
        </div>

        {/* Login Family Photo */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> {t('loginFamilyPhoto')}
          </h3>
          <div className="relative rounded-xl overflow-hidden border border-slate-200">
            <img src={familyPreview} alt={t('familyPhotoPreview')} className="w-full h-40 object-contain bg-slate-900" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="ghost" size="sm" disabled={uploading} icon={<Upload className="w-4 h-4" />} onClick={() => familyFileRef.current?.click()}>
              {t('replacePhoto')}
            </Button>
            {settings.login_family_image_url && (
              <Button variant="ghost" size="sm" onClick={handleRemoveFamilyImage}>{t('useDefaultPhoto')}</Button>
            )}
          </div>
          <input ref={familyFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file, 'family');
          }} />
        </div>

        {/* Property Info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> {t('propertyInformation')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('propertyName')} value={settings.property_name ?? ''} onChange={set('property_name')} placeholder={t('myProperty')} />
            <Input label={t('propertyPhoneLabel')} value={settings.property_phone ?? ''} onChange={set('property_phone')} placeholder="+257 00 00 00 00" />
            <div className="sm:col-span-2">
              <Input label={t('propertyAddressLabel')} value={settings.property_address ?? ''} onChange={set('property_address')} placeholder="Bujumbura" />
            </div>
            <div className="sm:col-span-2">
              <Input label={t('propertyEmail')} value={settings.property_email ?? ''} onChange={set('property_email')} placeholder="info@property.com" />
              <p className="mt-1 text-xs text-slate-500">
                {language === 'fr'
                  ? 'Cette adresse sera incluse comme contact sur les factures.'
                  : 'This address will be included as the contact email on invoices.'}
              </p>
            </div>
          </div>
        </div>

        <div className="settings-staff-footer-card bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="settings-staff-footer-heading text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" /> {t('staffCardFooter')}
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            {t('staffCardFooterDescription')}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Textarea
              className="settings-footer-message"
              label={t('footerMessageEnglish')}
              rows={3}
              maxLength={300}
              value={settings.staff_card_footer ?? DEFAULT_STAFF_CARD_FOOTER}
              onChange={event => setSettings(current => ({ ...current, staff_card_footer: event.target.value }))}
            />
            <Textarea
              className="settings-footer-message"
              label={t('footerMessageFrench')}
              rows={3}
              maxLength={300}
              value={settings.staff_card_footer_fr ?? DEFAULT_STAFF_CARD_FOOTER_FR}
              onChange={event => setSettings(current => ({ ...current, staff_card_footer_fr: event.target.value }))}
            />
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">{t('additionalPaymentMethods')}</h3>
              <p className="mt-1 text-xs text-slate-500">{t('paymentMethodsDescription')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="settings-add-method shrink-0 whitespace-nowrap"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setPaymentMethods(methods => [...methods, { id: crypto.randomUUID(), name: '', instructions: '' }])}
            >
              {t('addMethod')}
            </Button>
          </div>
          <div className="space-y-4">
            {paymentMethods.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('noAdditionalMethods')}</p>
            )}
            {paymentMethods.map((method, index) => (
              <div key={method.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                <Input
                  label={t('methodName')}
                  value={method.name}
                  maxLength={60}
                  onChange={event => setPaymentMethods(methods => methods.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}
                  placeholder={t('paymentMethodExample')}
                />
                <div className="flex items-end gap-2">
                  <Textarea
                    label={t('instructionsForTenants')}
                    value={method.instructions}
                    maxLength={500}
                    onChange={event => setPaymentMethods(methods => methods.map((item, i) => i === index ? { ...item, instructions: event.target.value } : item))}
                    placeholder={t('placeholderAccountSteps')}
                    rows={3}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setPaymentMethods(methods => methods.filter((_, i) => i !== index))}
                    aria-label={`${t('removePaymentMethod')}: ${method.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('paymentInstructionsTitle')}</h3>
          <p className="text-xs text-slate-500 mb-4">{t('paymentInstructionsDescription')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('bankName')} value={settings.bank_name ?? ''} onChange={set('bank_name')} placeholder={t('bankExample')} />
            <Input label={t('accountName')} value={settings.account_name ?? ''} onChange={set('account_name')} placeholder={t('accountNameExample')} />
            <Input label={t('accountNumber')} value={settings.account_number ?? ''} onChange={set('account_number')} placeholder="0123456789" />
            <Input label={t('mobileMoneyNumber')} value={settings.mobile_money_number ?? ''} onChange={set('mobile_money_number')} placeholder="+257 00 00 00 00" />
            <Input label={t('paymentReference')} value={settings.payment_reference ?? ''} onChange={set('payment_reference')} placeholder={t('rentReferenceExample')} />
          </div>
        </div>

        {/* Late Fee */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('latePaymentPolicy')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('lateFeeAmount')} type="number" value={settings.late_fee_amount ?? ''} onChange={set('late_fee_amount')} placeholder="500" />
            <Input label={t('gracePeriodDays')} type="number" value={settings.late_fee_due_day ?? ''} onChange={set('late_fee_due_day')} placeholder="5" />
          </div>
        </div>
      </div>

      <section className="settings-overview-gallery rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-700">
          <ImageIcon className="h-5 w-5" />
          {language === 'fr' ? 'Photos du carrousel du tableau de bord' : 'Dashboard carousel photos'}
        </h3>
        <p className="mb-5 text-sm text-slate-500">
          {language === 'fr'
            ? 'Ajoutez de 3 à 5 photos JPG ou PNG de 1200 × 800 px exactement au format horizontal (3 Mo maximum). Écrivez une citation de 15 mots maximum par photo et choisissez sa couleur. Enregistrez les paramètres pour appliquer les citations.'
            : 'Add 3–5 JPG or PNG photos exactly 1200 × 800 px in landscape (3 MB maximum). Add a quote of up to 15 words to each photo and choose its color. Save settings to apply quotes.'}
        </p>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => {
            const photo = overviewPhotos[index];
            return (
              <div key={index} className={`settings-overview-gallery-slot ${photo ? 'has-photo' : ''}`}>
                {photo ? (
                  <>
                    <img src={photo} alt={`${language === 'fr' ? 'Photo du carrousel' : 'Carousel photo'} ${index + 1}`} />
                    <span className="settings-overview-gallery-number">{index + 1}</span>
                    <div className="settings-overview-gallery-quote">
                      <Textarea
                        label={language === 'fr' ? `Citation ${index + 1}` : `Photo ${index + 1} quote`}
                        rows={2}
                        textareaRef={resizeOverviewQuoteField}
                        value={overviewQuotes[index]?.text ?? ''}
                        placeholder={language === 'fr' ? 'Écrivez une courte citation…' : 'Write a short quote…'}
                        onChange={event => {
                          resizeOverviewQuoteField(event.currentTarget);
                          updateOverviewQuote(index, { text: event.target.value });
                        }}
                      />
                      <span className={`settings-overview-gallery-quote-count ${countAdminOverviewQuoteWords(overviewQuotes[index]?.text ?? '') > MAX_ADMIN_OVERVIEW_QUOTE_WORDS ? 'is-over-limit' : ''}`}>
                        {countAdminOverviewQuoteWords(overviewQuotes[index]?.text ?? '')}/{MAX_ADMIN_OVERVIEW_QUOTE_WORDS} {language === 'fr' ? 'mots max.' : 'words max.'}
                      </span>
                      <div
                        className="settings-overview-quote-colors"
                        role="group"
                        aria-label={language === 'fr' ? 'Couleur de la citation' : 'Quote color'}
                      >
                        {ADMIN_OVERVIEW_QUOTE_COLORS.map(({ value, hex }) => {
                          const colorName = language === 'fr'
                            ? ({ green: 'Vert', black: 'Noir', red: 'Rouge', blue: 'Bleu pur', gray: 'Gris pur' } as const)[value]
                            : ({ green: 'Green', black: 'Black', red: 'Red', blue: 'Pure blue', gray: 'Pure gray' } as const)[value];
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`settings-overview-quote-color-dot ${overviewQuotes[index]?.color === value ? 'is-selected' : ''}`}
                              style={{ backgroundColor: hex }}
                              aria-label={colorName}
                              aria-pressed={overviewQuotes[index]?.color === value}
                              title={colorName}
                              onClick={() => updateOverviewQuote(index, { color: value })}
                            />
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={savingQuoteIndex !== null || saving || uploading}
                        onClick={() => { void saveOverviewQuote(index); }}
                        className={`settings-overview-quote-save ${JSON.stringify(overviewQuotes[index]) === JSON.stringify(savedOverviewQuotes[index]) ? 'is-saved' : ''}`}
                      >
                        {JSON.stringify(overviewQuotes[index]) === JSON.stringify(savedOverviewQuotes[index])
                          ? <Check className="h-3 w-3" />
                          : <Save className="h-3 w-3" />}
                        {savingQuoteIndex === index
                          ? (language === 'fr' ? 'Enregistrement…' : 'Saving…')
                          : JSON.stringify(overviewQuotes[index]) === JSON.stringify(savedOverviewQuotes[index])
                            ? (language === 'fr' ? 'Enregistrée' : 'Saved')
                            : (language === 'fr' ? 'Enregistrer la citation' : 'Save quote')}
                      </button>
                    </div>
                    <div className="settings-overview-gallery-actions">
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => setOverviewPhotoPreview(photo)}
                        className="settings-overview-gallery-action is-view"
                      >
                        <Eye className="h-2.5 w-2.5" />
                        {language === 'fr' ? 'Aperçu' : 'Preview'}
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                          overviewPhotoReplaceIndex.current = index;
                          overviewPhotoReplaceRef.current?.click();
                        }}
                        className="settings-overview-gallery-action is-replace"
                      >
                        <Upload className="h-2.5 w-2.5" />
                        {language === 'fr' ? 'Remplacer' : 'Replace'}
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => { void handleDeleteOverviewPhoto(index); }}
                        className="settings-overview-gallery-action is-delete"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        {language === 'fr' ? 'Supprimer' : 'Delete'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={uploading || overviewPhotos.length >= 5}
                    onClick={() => overviewPhotosFileRef.current?.click()}
                    className="settings-overview-gallery-empty"
                  >
                    <ImageIcon className="h-7 w-7" />
                    <span>{language === 'fr' ? `Emplacement ${index + 1}` : `Photo slot ${index + 1}`}</span>
                    <span className="settings-overview-gallery-empty-action">{language === 'fr' ? 'Ajouter' : 'Add photo'}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="settings-overview-gallery-add"
          disabled={uploading || overviewPhotos.length >= 5}
          icon={<Upload className="h-4 w-4" />}
          onClick={() => overviewPhotosFileRef.current?.click()}
        >
          {language === 'fr' ? 'Galerie' : 'Gallery'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading || overviewPhotos.length > 0}
          className="ml-2"
          icon={<ImageIcon className="h-4 w-4" />}
          onClick={() => { void handleImportCurrentPhoto(); }}
        >
          {language === 'fr' ? 'Importer la photo actuelle ×5' : 'Import current photo ×5'}
        </Button>
        <input
          ref={overviewPhotosFileRef}
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          multiple
          className="hidden"
          onChange={event => {
            void handleOverviewPhotosUpload(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={overviewPhotoReplaceRef}
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="hidden"
          onChange={event => {
            const index = overviewPhotoReplaceIndex.current;
            overviewPhotoReplaceIndex.current = null;
            if (index !== null) void handleOverviewPhotosUpload(event.target.files, index);
            event.target.value = '';
          }}
        />
      </section>

      {overviewPhotoPreview && (
        <div
          className="settings-overview-preview-backdrop"
          role="presentation"
          onClick={() => setOverviewPhotoPreview(null)}
        >
          <div
            className="settings-overview-preview"
            role="dialog"
            aria-modal="true"
            aria-label={language === 'fr' ? 'Aperçu de la photo' : 'Photo preview'}
            onClick={event => event.stopPropagation()}
          >
            <img src={overviewPhotoPreview} alt={language === 'fr' ? 'Aperçu de la photo du carrousel' : 'Dashboard carousel photo preview'} />
            <Button variant="outline" size="sm" onClick={() => setOverviewPhotoPreview(null)}>
              {language === 'fr' ? 'Fermer' : 'Close'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button loading={saving} icon={<Save className="w-4 h-4" />} onClick={handleSave} size="lg">
          {t('saveSettings')}
        </Button>
      </div>
    </div>
  );
}
