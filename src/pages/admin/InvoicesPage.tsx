import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Printer, Trash2 } from 'lucide-react';
import { supabase, Tenant, UtilityInvoice } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useTheme } from '@/contexts/ThemeContext';
import { printDocument } from '@/lib/print';
import InvoiceDocument from '@/components/InvoiceDocument';

type InvoiceForm = {
  tenant_id: string;
  rent_month: string;
  rent_amount: string;
  water_amount: string;
  electricity_amount: string;
  due_date: string;
  notes: string;
};

const emptyForm: InvoiceForm = {
  tenant_id: '',
  rent_month: new Date().toISOString().slice(0, 7),
  rent_amount: '',
  water_amount: '0',
  electricity_amount: '0',
  due_date: new Date().toISOString().slice(0, 10),
  notes: '',
};

const invoiceSelect = '*, tenants(id, full_name, tenant_code, user_id, houses(house_number)), houses(house_number)';

export default function InvoicesPage() {
  const { profile } = useAuth();
  const { fmt, t, language } = useTheme();
  const canManageInvoices = profile?.role === 'admin' || profile?.role === 'property_manager';
  const { toasts, addToast, removeToast } = useToast();
  const [invoices, setInvoices] = useState<UtilityInvoice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UtilityInvoice | null>(null);
  const [viewing, setViewing] = useState<UtilityInvoice | null>(null);
  const [deleting, setDeleting] = useState<UtilityInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: tenantData, error: tenantError }] = await Promise.all([
      supabase.from('utility_invoices').select(invoiceSelect).order('rent_month', { ascending: false }),
      supabase.from('tenants').select('*, houses(house_number)').eq('status', 'active').order('full_name'),
    ]);
    if (error) {
      addToast(
        error.code === 'PGRST205'
          ? (language === 'fr'
            ? 'La table des factures est absente de Supabase. Appliquez les migrations en attente, notamment 20261011070000_add_utility_invoices.sql, puis actualisez cette page.'
            : 'The invoice table is missing from Supabase. Apply the pending migrations, including 20261011070000_add_utility_invoices.sql, then refresh this page.')
          : error.message,
        'error',
      );
    }
    else setInvoices((data ?? []) as UtilityInvoice[]);
    if (tenantError) addToast(tenantError.message, 'error');
    else setTenants((tenantData ?? []) as Tenant[]);
    setLoading(false);
  }, [addToast, language]);

  useEffect(() => { load(); }, [load]);

  const setField = (key: keyof InvoiceForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (invoice: UtilityInvoice) => {
    setEditing(invoice);
    setForm({
      tenant_id: invoice.tenant_id,
      rent_month: invoice.rent_month.slice(0, 7),
      rent_amount: String(invoice.rent_amount),
      water_amount: String(invoice.water_amount),
      electricity_amount: String(invoice.electricity_amount),
      due_date: invoice.due_date,
      notes: invoice.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleTenantSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const tenant = tenants.find(item => item.id === event.target.value);
    setForm(current => ({
      ...current,
      tenant_id: event.target.value,
      rent_amount: String(tenant?.monthly_rent ?? ''),
    }));
  };

  const saveInvoice = async () => {
    const rent = Number(form.rent_amount);
    const water = Number(form.water_amount);
    const electricity = Number(form.electricity_amount);
    const tenant = tenants.find(item => item.id === form.tenant_id);
    if (!tenant || !tenant.house_id || !form.rent_month || !form.due_date) {
      addToast(language === 'fr' ? 'Sélectionnez un locataire avec un logement et complétez les dates.' : 'Select a tenant with an assigned house and complete the dates.', 'error');
      return;
    }
    if (![rent, water, electricity].every(amount => Number.isFinite(amount) && amount >= 0)) {
      addToast(language === 'fr' ? 'Les montants doivent être des nombres positifs.' : 'Amounts must be valid non-negative numbers.', 'error');
      return;
    }
    const month = `${form.rent_month}-01`;
    const payload = {
      tenant_id: tenant.id,
      house_id: tenant.house_id,
      rent_month: month,
      rent_amount: rent,
      water_amount: water,
      electricity_amount: electricity,
      total_amount: rent + water + electricity,
      due_date: form.due_date,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    let saveError: { code: string; message: string } | null = null;
    let invoiceNumber: string | undefined;
    let invoiceId: string | undefined;
    if (editing) {
      const { error } = await supabase.from('utility_invoices').update(payload).eq('id', editing.id);
      saveError = error;
    } else {
      const { data, error } = await supabase
        .from('utility_invoices')
        .insert(payload)
        .select('id, invoice_number')
        .single();
      saveError = error;
      invoiceNumber = data?.invoice_number;
      invoiceId = data?.id;
    }

    if (saveError) {
      const rlsMigration = profile?.role === 'property_manager'
        ? '20261013140000_allow_property_managers_to_manage_assigned_invoices.sql'
        : profile?.role === 'caretaker'
          ? '20261013160000_limit_caretaker_invoices_to_read_only.sql'
          : 'the latest invoice access migration';
      addToast(
        saveError.code === '23505'
          ? (language === 'fr' ? 'Une facture existe déjà pour ce locataire et ce mois.' : 'An invoice already exists for this tenant and month.')
          : saveError.code === '42501'
            ? (language === 'fr'
              ? `Accès refusé par Supabase. Vérifiez l’affectation du logement et appliquez la migration ${rlsMigration}.`
              : `Supabase denied invoice access. Check the tenant's house assignment and apply migration ${rlsMigration}.`)
            : saveError.message,
        'error',
      );
    } else {
      setModalOpen(false);
      await load();
      if (!editing && tenant.user_id && invoiceNumber && invoiceId) {
        const invoiceMonth = new Date(`${month.slice(0, 7)}-01`).toLocaleDateString(
          language === 'fr' ? 'fr-FR' : 'en-US',
          { month: 'long', year: 'numeric' },
        );
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: tenant.user_id,
          invoice_id: invoiceId,
          title: language === 'fr' ? 'Nouvelle facture disponible' : 'New invoice available',
          message: language === 'fr'
            ? `Votre facture ${invoiceNumber} pour ${invoiceMonth} est prête. Connectez-vous et ouvrez Factures pour la consulter ou l’enregistrer en PDF.`
            : `Your invoice ${invoiceNumber} for ${invoiceMonth} is ready. Sign in and open Invoices to view it or save it as a PDF.`,
          type: 'info',
          link: 'tenant-invoices',
        });
        if (notificationError) {
          addToast(
            language === 'fr'
              ? `Facture créée, mais la notification n’a pas été envoyée : ${notificationError.message}`
              : `Invoice created, but the tenant notification could not be sent: ${notificationError.message}`,
            'warning',
          );
        } else {
          addToast(
            language === 'fr'
              ? 'Facture créée et notification envoyée au locataire.'
              : 'Invoice created and notification sent to the tenant.',
            'success',
          );
        }
      } else if (!editing) {
        addToast(t('invoiceSaved'), 'success');
        if (tenant.user_id) {
          addToast(
            language === 'fr'
              ? 'Facture créée, mais le numéro de facture est indisponible pour la notification.'
              : 'Invoice created, but its invoice number was unavailable for the notification.',
            'warning',
          );
        } else {
          addToast(
            language === 'fr'
              ? 'Facture créée, mais ce locataire n’a pas de compte connecté pour recevoir la notification.'
              : 'Invoice created, but this tenant has no linked account to receive a notification.',
            'warning',
          );
        }
      } else {
        addToast(t('invoiceSaved'), 'success');
      }
    }
    setSaving(false);
  };

  const updateStatus = async (invoice: UtilityInvoice) => {
    const nextStatus = invoice.status === 'paid' ? 'unpaid' : 'paid';
    const { error } = await supabase.from('utility_invoices')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', invoice.id);
    if (error) addToast(error.message, 'error');
    else {
      addToast(language === 'fr' ? 'Statut de la facture mis à jour.' : 'Invoice status updated.', 'success');
      load();
    }
  };

  const deleteInvoice = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('utility_invoices').delete().eq('id', deleting.id);
    if (error) addToast(error.message, 'error');
    else {
      addToast(t('invoiceDeleted'), 'success');
      setDeleting(null);
      load();
    }
  };

  const printInvoice = (invoice: UtilityInvoice) => {
    setViewing(invoice);
    window.setTimeout(() => printDocument('invoice', 'invoice-print-document'), 100);
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('invoices')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('invoiceRentUtilities')}</p>
        </div>
        {canManageInvoices && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>{t('createInvoice')}</Button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">{t('invoiceNumber')}</th>
                <th className="px-5 py-3">{t('tenant')}</th>
                <th className="px-5 py-3">{t('invoiceMonth')}</th>
                <th className="px-5 py-3 text-right">{t('totalDue')}</th>
                <th className="px-5 py-3 text-center">{t('accountStatus')}</th>
                <th className="px-5 py-3 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="py-10 text-center text-slate-500">{t('loading')}</td></tr>}
              {!loading && invoices.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-500">{t('noInvoices')}</td></tr>}
              {invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900">{invoice.invoice_number}</td>
                  <td className="px-5 py-3 text-sm text-slate-700">{invoice.tenants?.full_name ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-slate-700">
                    {new Date(`${invoice.rent_month.slice(0, 7)}-01`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900"><span className="money-value">{fmt(Number(invoice.total_amount))}</span></td>
                  <td className="px-5 py-3 text-center">
                    {canManageInvoices ? (
                      <button
                        type="button"
                        onClick={() => updateStatus(invoice)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                      >
                        {t(invoice.status)}
                      </button>
                    ) : (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {t(invoice.status)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button title={t('printInvoice')} onClick={() => printInvoice(invoice)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Printer className="h-4 w-4" /></button>
                      {canManageInvoices && (
                        <>
                          <button title={t('editInvoice')} onClick={() => openEdit(invoice)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                          <button title={t('delete')} onClick={() => setDeleting(invoice)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManageInvoices && <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t(editing ? 'editInvoice' : 'createInvoice')} size="lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label={t('tenant')} value={form.tenant_id} onChange={handleTenantSelect}>
            <option value="">{t('selectTenant')}</option>
            {tenants.map(tenant => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.full_name}{tenant.houses?.house_number ? ` · ${tenant.houses.house_number}` : ''}
              </option>
            ))}
          </Select>
          <Input label={t('invoiceMonth')} type="month" value={form.rent_month} onChange={setField('rent_month')} />
          <Input label={t('rent')} type="number" min="0" step="0.01" value={form.rent_amount} onChange={setField('rent_amount')} />
          <Input label={t('water')} type="number" min="0" step="0.01" value={form.water_amount} onChange={setField('water_amount')} />
          <Input label={t('electricity')} type="number" min="0" step="0.01" value={form.electricity_amount} onChange={setField('electricity_amount')} />
          <Input label={t('invoiceDueDate')} type="date" value={form.due_date} onChange={setField('due_date')} />
          <div className="sm:col-span-2">
            <Textarea label={t('notes')} value={form.notes} onChange={setField('notes')} rows={3} maxLength={1000} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <span className="font-semibold text-slate-700">{t('totalDue')}</span>
            <span className="text-lg font-bold text-slate-900 money-value">
              {fmt((Number(form.rent_amount) || 0) + (Number(form.water_amount) || 0) + (Number(form.electricity_amount) || 0))}
            </span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button loading={saving} onClick={saveInvoice}>{t('saveInvoice')}</Button>
        </div>
      </Modal>}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={t('invoice')} size="lg">
        {viewing && <InvoiceDocument invoice={viewing} />}
        <div className="mt-4 flex justify-end">
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => printDocument('invoice', 'invoice-print-document')}>{t('printSavePdf')}</Button>
        </div>
      </Modal>

      {canManageInvoices && <Modal open={!!deleting} onClose={() => setDeleting(null)} title={t('delete')} size="sm">
        <p className="text-sm text-slate-600">{language === 'fr' ? 'Supprimer cette facture ? Cette action est irréversible.' : 'Delete this invoice? This action cannot be undone.'}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
          <Button variant="danger" onClick={deleteInvoice}>{t('delete')}</Button>
        </div>
      </Modal>}
    </div>
  );
}
