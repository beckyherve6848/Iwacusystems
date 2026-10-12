import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';

const emptyForm = {
  visitor_name: '', phone: '', national_id: '', tenant_id: '',
  house_id: '', purpose: '', number_of_visitors: '1',
  visit_date: new Date().toISOString().slice(0, 10),
  visit_time: new Date().toTimeString().slice(0, 5),
  expected_departure: '',
  notes: '',
};

export default function CaretakerRegisterVisitorPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user, profile } = useAuth();
  const { t, language } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });
  const [tenants, setTenants] = useState<any[]>([]);
  const [houses, setHouses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const propertyId = profile?.assigned_property_group_id;
    if (!propertyId) {
      setTenants([]);
      setHouses([]);
      return;
    }
    const loadPropertyData = async () => {
      const [tenantResult, houseResult] = await Promise.all([
        supabase.from('tenants').select('id, full_name, house_id').eq('status', 'active'),
        supabase.from('houses').select('id, house_number, property_id').eq('property_id', propertyId).order('house_number'),
      ]);
      const error = tenantResult.error ?? houseResult.error;
      if (error) {
        addToast(`Unable to load assigned property data: ${error.message}`, 'error');
        return;
      }
      const loadedHouses = houseResult.data ?? [];
      const assignedHouseIds = new Set(loadedHouses.map(house => house.id));
      setTenants((tenantResult.data ?? []).filter(tenant =>
        tenant.house_id !== null && assignedHouseIds.has(tenant.house_id)));
      setHouses(loadedHouses);
    };
    void loadPropertyData();
  }, [profile?.assigned_property_group_id, addToast]);

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    const tenant = tenants.find(t => t.id === tid);
    setForm(f => ({
      ...f,
      tenant_id: tid,
      house_id: tenant?.house_id ?? '',
    }));
  };

  const handleSave = async () => {
    if (!form.visitor_name || !form.purpose) {
      addToast(t('visitorNameRequired'), 'error'); return;
    }
    setSaving(true);
    const visitDateTime = form.visit_date && form.visit_time
      ? new Date(`${form.visit_date}T${form.visit_time}`).toISOString()
      : new Date().toISOString();

    const payload: any = {
      visitor_name: form.visitor_name,
      phone: form.phone || null,
      national_id: form.national_id || null,
      tenant_id: form.tenant_id || null,
      house_id: form.house_id || null,
      purpose: form.purpose,
      number_of_visitors: Number(form.number_of_visitors) || 1,
      visit_date: form.visit_date || null,
      time_in: visitDateTime,
      status: 'inside',
      registered_by: user?.id,
      expected_departure: form.expected_departure ? new Date(form.expected_departure).toISOString() : null,
      notes: form.notes || null,
    };

    const { error } = await supabase.from('visitors').insert(payload);
    if (error) { addToast(error.message, 'error'); }
    else {
      addToast(t('visitorRegistered'), 'success');
      setForm({ ...emptyForm });
      onNavigate('caretaker-visitors');
    }
    setSaving(false);
  };

  const panelClass = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('caretaker-dashboard')}
          className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('registerVisitor')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('registerVisitorDescription')}</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`${panelClass} p-5 sm:p-6`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={`${t('visitorName')} *`} value={form.visitor_name} onChange={set('visitor_name')} placeholder={language === 'fr' ? 'Nom complet du visiteur' : 'Visitor full name'} />
          <Input label={t('phone')} type="tel" value={form.phone} onChange={set('phone')} placeholder="+257 68 000 000" />
          <Input label={t('nationalId')} value={form.national_id} onChange={set('national_id')} placeholder={t('optional')} />
          <Input label={t('numberOfVisitors')} type="number" value={form.number_of_visitors} onChange={set('number_of_visitors')} />
          <Select label={t('personVisiting')} value={form.tenant_id} onChange={handleTenantChange}>
            <option value="">{t('selectTenantForVisit')}</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                {t.full_name} {t.houses?.house_number ? `(${t.houses.house_number})` : ''}
              </option>
            ))}
          </Select>
          <Select label={t('apartment')} value={form.house_id} onChange={set('house_id')}>
            <option value="">{t('selectHouse')}</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.house_number}</option>)}
          </Select>
          <Input label={`${t('visitPurpose')} *`} value={form.purpose} onChange={set('purpose')} placeholder={language === 'fr' ? 'ex. Visite familiale, livraison' : 'e.g. Family visit, Delivery'} />
          <Input label={t('visitDate')} type="date" value={form.visit_date} onChange={set('visit_date')} />
          <Input label={t('visitTime')} type="time" value={form.visit_time} onChange={set('visit_time')} />
          <Input label={t('expectedDeparture')} type="datetime-local" value={form.expected_departure} onChange={set('expected_departure')} />
        </div>

        <div className="mt-4">
          <Textarea label={t('notes')} value={form.notes} onChange={set('notes')} placeholder={t('additionalVisitorNotes')} rows={3} />
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('registerVisitor')}
          </Button>
          <Button variant="ghost" onClick={() => onNavigate('caretaker-visitors')}>{t('cancel')}</Button>
        </div>
      </motion.div>
    </div>
  );
}
