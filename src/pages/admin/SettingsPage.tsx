import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Input, { Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Save, Settings, Upload, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_STAFF_CARD_FOOTER, DEFAULT_STAFF_CARD_FOOTER_FR, useTheme } from '@/contexts/ThemeContext';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState('/iwacu-mark-512.png');
  const [familyPreview, setFamilyPreview] = useState('/Bck.png');
  const logoFileRef = useRef<HTMLInputElement>(null);
  const familyFileRef = useRef<HTMLInputElement>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { updateBranding } = useTheme();

  useEffect(() => {
    supabase.from('settings').select('key, value').then(({ data, error }) => {
      if (error) {
        addToast(`Unable to load settings: ${error.message}`, 'error');
        setLoading(false);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach(s => { map[s.key] = s.value ?? ''; });
      try {
        setPaymentMethods(parseCustomPaymentMethods(map.custom_payment_methods));
      } catch (error) {
        addToast(`Unable to load payment methods: ${error instanceof Error ? error.message : String(error)}`, 'error');
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
  }, [addToast]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [key]: e.target.value }));

  const handleFileUpload = async (file: File, asset: 'logo' | 'family') => {
    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
    if (!allowedImageTypes.includes(file.type)) {
      addToast('Choose a PNG, JPG, WebP, GIF, or AVIF image', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('Image must be under 5MB', 'error');
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
    addToast('Image uploaded. Click Save Settings to apply.', 'success');
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
      addToast('App name cannot be empty', 'error');
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
        addToast('Every payment method needs a name and instructions', 'error');
        setSaving(false);
        return;
      }
      const normalizedName = name.toLocaleLowerCase();
      if (reservedMethodNames.includes(normalizedName)) {
        addToast(`"${name}" is already a built-in payment method`, 'error');
        setSaving(false);
        return;
      }
      if (methodsByName.has(normalizedName)) {
        addToast(`Payment method "${name}" is listed more than once`, 'error');
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
      addToast(`Unable to save settings: ${error.message}`, 'error');
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
      addToast('Settings saved successfully', 'success');
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
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Configure your property management system</p>
      </div>

      <div className="space-y-4">
        {/* App Branding */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" /> App Branding
          </h3>
          <div className="space-y-4">
            <Input label="App Name" value={settings.app_name ?? 'Iwacusystem'} onChange={set('app_name')} placeholder="Iwacusystem" />
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">App Logo</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-2">
                  <img src={logoPreview} alt="App logo preview" className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" disabled={uploading} icon={<Upload className="w-4 h-4" />} onClick={() => logoFileRef.current?.click()}>
                    Replace Logo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRemoveLogo}>Use Default</Button>
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
            <ImageIcon className="w-4 h-4" /> Login Page Family Photo
          </h3>
          <div className="relative rounded-xl overflow-hidden border border-slate-200">
            <img src={familyPreview} alt="Login family photo preview" className="w-full h-40 object-contain bg-slate-900" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="ghost" size="sm" disabled={uploading} icon={<Upload className="w-4 h-4" />} onClick={() => familyFileRef.current?.click()}>
              Replace Photo
            </Button>
            {settings.login_family_image_url && (
              <Button variant="ghost" size="sm" onClick={handleRemoveFamilyImage}>Use Default Photo</Button>
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
            <Settings className="w-4 h-4" /> Property Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Property Name" value={settings.property_name ?? ''} onChange={set('property_name')} placeholder="My Property" />
            <Input label="Property Phone" value={settings.property_phone ?? ''} onChange={set('property_phone')} placeholder="+254 700 000 000" />
            <div className="sm:col-span-2">
              <Input label="Property Address" value={settings.property_address ?? ''} onChange={set('property_address')} placeholder="123 Main St, Nairobi" />
            </div>
            <div className="sm:col-span-2">
              <Input label="Property Email" value={settings.property_email ?? ''} onChange={set('property_email')} placeholder="info@property.com" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Staff ID Card Footer
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Set the message shown at the bottom of staff ID cards in each language. Use {'{phone}'} for Property Phone, {'{address}'} for Property Address, or {'{property}'} for the staff member’s assigned property.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Textarea
              label="Footer message (English)"
              rows={3}
              maxLength={300}
              value={settings.staff_card_footer ?? DEFAULT_STAFF_CARD_FOOTER}
              onChange={event => setSettings(current => ({ ...current, staff_card_footer: event.target.value }))}
            />
            <Textarea
              label="Message de pied de carte (français)"
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
              <h3 className="text-sm font-semibold text-slate-700">Additional Payment Methods</h3>
              <p className="mt-1 text-xs text-slate-500">Add payment options and instructions that tenants can view on their dashboard.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setPaymentMethods(methods => [...methods, { id: crypto.randomUUID(), name: '', instructions: '' }])}
            >
              Add Method
            </Button>
          </div>
          <div className="space-y-4">
            {paymentMethods.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No additional payment methods have been added.</p>
            )}
            {paymentMethods.map((method, index) => (
              <div key={method.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                <Input
                  label="Method Name"
                  value={method.name}
                  maxLength={60}
                  onChange={event => setPaymentMethods(methods => methods.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}
                  placeholder="e.g. Lumicash"
                />
                <div className="flex items-end gap-2">
                  <Textarea
                    label="Instructions for tenants"
                    value={method.instructions}
                    maxLength={500}
                    onChange={event => setPaymentMethods(methods => methods.map((item, i) => i === index ? { ...item, instructions: event.target.value } : item))}
                    placeholder="Enter number, account, or steps"
                    rows={3}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setPaymentMethods(methods => methods.filter((_, i) => i !== index))}
                    aria-label={`Remove ${method.name || 'payment method'}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment Instructions</h3>
          <p className="text-xs text-slate-500 mb-4">These details are shown to tenants when making payments.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Bank Name" value={settings.bank_name ?? ''} onChange={set('bank_name')} placeholder="Equity Bank" />
            <Input label="Account Name" value={settings.account_name ?? ''} onChange={set('account_name')} placeholder="Property Manager Ltd" />
            <Input label="Account Number" value={settings.account_number ?? ''} onChange={set('account_number')} placeholder="0123456789" />
            <Input label="Mobile Money Number" value={settings.mobile_money_number ?? ''} onChange={set('mobile_money_number')} placeholder="0712 345 678" />
            <Input label="Payment Reference" value={settings.payment_reference ?? ''} onChange={set('payment_reference')} placeholder="RENT" />
          </div>
        </div>

        {/* Late Fee */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Late Payment Policy</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Late Fee Amount (Fbu)" type="number" value={settings.late_fee_amount ?? ''} onChange={set('late_fee_amount')} placeholder="500" />
            <Input label="Grace Period (days)" type="number" value={settings.late_fee_due_day ?? ''} onChange={set('late_fee_due_day')} placeholder="5" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button loading={saving} icon={<Save className="w-4 h-4" />} onClick={handleSave} size="lg">
          Save Settings
        </Button>
      </div>
    </div>
  );
}
