import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Input, { Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Save, Settings, Upload, Image as ImageIcon, Plus, Trash2, Smartphone, Sun, Moon } from 'lucide-react';
import { DEFAULT_STAFF_CARD_FOOTER, DEFAULT_STAFF_CARD_FOOTER_FR, useTheme } from '@/contexts/ThemeContext';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';
import {
  getThemeModeForCurrentDevice,
  getThemeModeForDevice,
  isPhoneViewport,
  PhoneThemeMode,
  saveThemeModeForDevice,
} from '@/lib/phoneThemeMode';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState('/iwacu-mark-512.png');
  const [familyPreview, setFamilyPreview] = useState('/Bck.png');
  const [phoneThemeMode, setPhoneThemeMode] = useState<PhoneThemeMode>(() => getThemeModeForCurrentDevice());
  const [isPhoneDevice, setIsPhoneDevice] = useState(() => isPhoneViewport());
  const logoFileRef = useRef<HTMLInputElement>(null);
  const familyFileRef = useRef<HTMLInputElement>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { updateBranding, t } = useTheme();

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
      setSettings({
        ...map,
        app_name: map.app_name || 'Iwacusystem',
        logo_url: map.logo_url || '/iwacu-mark-512.png',
        staff_card_footer: map.staff_card_footer || DEFAULT_STAFF_CARD_FOOTER,
        staff_card_footer_fr: map.staff_card_footer_fr || DEFAULT_STAFF_CARD_FOOTER_FR,
        login_family_image_url: map.login_family_image_url || '',
      });
      setLoading(false);
    });
  }, [addToast, t]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [key]: e.target.value }));

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
      });
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
    <div className="space-y-6 max-w-2xl">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settingsTitle')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('settingsDescription')}</p>
      </div>

      <div className="space-y-4">
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

      <div className="flex justify-end">
        <Button loading={saving} icon={<Save className="w-4 h-4" />} onClick={handleSave} size="lg">
          {t('saveSettings')}
        </Button>
      </div>
    </div>
  );
}
