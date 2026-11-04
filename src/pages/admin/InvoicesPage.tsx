import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Mail, Plus, Pencil, Printer, Trash2 } from 'lucide-react';
import { supabase, Tenant, UtilityInvoice } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import MonthPicker from '@/components/ui/MonthPicker';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useTheme } from '@/contexts/ThemeContext';
import { printDocument } from '@/lib/print';
import InvoiceDocument from '@/components/InvoiceDocument';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { calculateInvoiceChargeBalances } from '@/lib/invoiceBalances';
import { getTenantsDueForInvoice } from '@/lib/invoiceDue';
import { normalizePhoneNumber } from '@/lib/phone';
import { CustomPaymentMethod, parseCustomPaymentMethods } from '@/lib/paymentMethods';

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

const invoiceSelect = '*, tenants(id, full_name, tenant_code, user_id, phone, email, houses(house_number)), houses(house_number)';

function AndroidMessagesIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill="#43A047" />
      <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7.2L7 21v-3.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Z" fill="#fff" />
      <circle cx="8" cy="12" r="1" fill="#43A047" />
      <circle cx="12" cy="12" r="1" fill="#43A047" />
      <circle cx="16" cy="12" r="1" fill="#43A047" />
    </svg>
  );
}

type ActiveLease = {
  tenant_id: string;
  lease_start_date: string;
  lease_end_date: string | null;
  monthly_rent: number;
};

export default function InvoicesPage() {
  const { profile, user } = useAuth();
  const { fmt, t, language } = useTheme();
  const canManageInvoices = profile?.role === 'admin' || profile?.role === 'property_manager';
  const { toasts, addToast, removeToast } = useToast();
  const [invoices, setInvoices] = useState<UtilityInvoice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeLeases, setActiveLeases] = useState<ActiveLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UtilityInvoice | null>(null);
  const [viewing, setViewing] = useState<UtilityInvoice | null>(null);
  const [messageInvoice, setMessageInvoice] = useState<UtilityInvoice | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [propertyEmail, setPropertyEmail] = useState('');
  const [paymentSettings, setPaymentSettings] = useState<Record<string, string>>({});
  const [customPaymentMethods, setCustomPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [deleting, setDeleting] = useState<UtilityInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: tenantData, error: tenantError }, { data: paymentData, error: paymentError }] = await Promise.all([
      supabase.from('utility_invoices').select(invoiceSelect).order('rent_month', { ascending: false }),
      supabase.from('tenants').select('*, houses(house_number)').eq('status', 'active').order('full_name'),
      supabase.from('payments').select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount'),
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
    } else {
      if (paymentError) {
        addToast(`Unable to load utility payment balances: ${paymentError.message}`, 'error');
      }
      const invoiceRows = (data ?? []) as UtilityInvoice[];
      const balances = calculateInvoiceChargeBalances(invoiceRows, paymentData ?? []);
      setInvoices(invoiceRows.map(invoice => ({ ...invoice, ...balances.get(invoice.id) })));
    }
    if (tenantError) addToast(tenantError.message, 'error');
    else setTenants((tenantData ?? []) as Tenant[]);
    if (profile?.role === 'admin') {
      const { data: leaseData, error: leaseError } = await supabase
        .from('rental_agreements')
        .select('tenant_id, lease_start_date, lease_end_date, monthly_rent')
        .eq('status', 'active');
      if (leaseError) {
        addToast(leaseError.message, 'error');
        setActiveLeases([]);
      } else {
        setActiveLeases((leaseData ?? []) as ActiveLease[]);
      }
    } else {
      setActiveLeases([]);
    }
    setLoading(false);
  }, [addToast, language, profile?.role]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    supabase.from('settings').select('key, value').in('key', [
      'property_email',
      'bank_name',
      'account_name',
      'account_number',
      'mobile_money_number',
      'payment_reference',
      'custom_payment_methods',
    ]).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        addToast(`${language === 'fr' ? 'Impossible de charger les informations de paiement' : 'Unable to load payment details'}: ${error.message}`, 'error');
        return;
      }
      const settings = Object.fromEntries((data ?? []).map(setting => [setting.key, setting.value?.trim() ?? '']));
      setPaymentSettings(settings);
      setPropertyEmail(settings.property_email ?? '');
      try {
        setCustomPaymentMethods(parseCustomPaymentMethods(settings.custom_payment_methods));
      } catch (caught) {
        addToast(
          `${language === 'fr' ? 'Modes de paiement enregistrés invalides' : 'Saved payment methods are invalid'}: ${caught instanceof Error ? caught.message : String(caught)}`,
          'error',
        );
      }
    });
    return () => { active = false; };
  }, [addToast, language]);

  const setField = (key: keyof InvoiceForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openCreateForTenant = (tenant: Tenant, month: string, dueDate: string) => {
    const lease = activeLeases.find(item => item.tenant_id === tenant.id);
    setEditing(null);
    setForm({
      ...emptyForm,
      tenant_id: tenant.id,
      rent_month: month,
      rent_amount: String(lease?.monthly_rent ?? tenant.monthly_rent ?? ''),
      due_date: dueDate,
    });
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
    const lease = activeLeases.find(item => item.tenant_id === tenant?.id);
    setForm(current => ({
      ...current,
      tenant_id: event.target.value,
      rent_amount: String(lease?.monthly_rent ?? tenant?.monthly_rent ?? ''),
    }));
  };

  const createInvoiceMessage = (invoice: UtilityInvoice) => {
    const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
    const dueDate = new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const invoiceMonth = new Date(`${invoice.rent_month.slice(0, 7)}-01`).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
    const rentAmount = Number(invoice.rent_amount);
    const waterAmount = Number(invoice.water_amount);
    const electricityAmount = Number(invoice.electricity_amount);
    const rentBalance = Math.max(0, Number(invoice.rent_balance));
    const waterBalance = Math.max(0, Number(invoice.water_balance ?? waterAmount));
    const electricityBalance = Math.max(0, Number(invoice.electricity_balance ?? electricityAmount));
    const appliedRent = Math.max(0, rentAmount - rentBalance);
    const appliedWater = Math.max(0, waterAmount - waterBalance);
    const appliedElectricity = Math.max(0, electricityAmount - electricityBalance);
    const balanceDue = invoice.status === 'paid'
      ? 0
      : Math.max(0, Number(invoice.total_balance_due ?? rentBalance + waterBalance + electricityBalance));
    const paymentDetails = [
      paymentSettings.bank_name && `${t('bankName')}: ${paymentSettings.bank_name}`,
      paymentSettings.account_name && `${t('accountName')}: ${paymentSettings.account_name}`,
      paymentSettings.account_number && `${t('accountNumber')}: ${paymentSettings.account_number}`,
      paymentSettings.mobile_money_number && `${t('mobileMoneyNumber')}: ${paymentSettings.mobile_money_number}`,
      paymentSettings.payment_reference && `${t('paymentReference')}: ${paymentSettings.payment_reference}`,
      ...customPaymentMethods.map(method => `${method.name}: ${method.instructions}`),
    ].filter((detail): detail is string => Boolean(detail));
    const paymentInstructions = paymentDetails.length
      ? [
        language === 'fr' ? 'INFORMATIONS DE PAIEMENT' : 'PAYMENT DETAILS',
        ...paymentDetails,
      ]
      : [];

    if (language === 'fr') {
      return [
        `Bonjour ${invoice.tenants?.full_name ?? ''},`,
        '',
        `Veuillez trouver le récapitulatif de votre facture ${invoice.invoice_number} pour ${invoiceMonth}.`,
        '',
        'DÉTAIL DES FRAIS',
        `Loyer : ${fmt(rentAmount)}`,
        `Eau : ${fmt(waterAmount)}`,
        `Électricité : ${fmt(electricityAmount)}`,
        `Total de la facture : ${fmt(Number(invoice.total_amount))}`,
        '',
        'PAIEMENTS APPLIQUÉS',
        `Loyer : ${fmt(appliedRent)}`,
        `Eau : ${fmt(appliedWater)}`,
        `Électricité : ${fmt(appliedElectricity)}`,
        `Solde restant : ${fmt(balanceDue)}`,
        `Date limite de paiement : ${dueDate}`,
        ...(paymentInstructions.length ? ['', ...paymentInstructions] : []),
        '',
        'Pour toute question concernant cette facture, veuillez nous contacter.',
        'Cordialement,',
        'L’équipe de gestion',
      ].join('\n');
    }

    return [
      `Hello ${invoice.tenants?.full_name ?? ''},`,
      '',
      `Please find the summary of your invoice ${invoice.invoice_number} for ${invoiceMonth}.`,
      '',
      'CHARGE BREAKDOWN',
      `Rent: ${fmt(rentAmount)}`,
      `Water: ${fmt(waterAmount)}`,
      `Electricity: ${fmt(electricityAmount)}`,
      `Invoice total: ${fmt(Number(invoice.total_amount))}`,
      '',
      'PAYMENTS APPLIED',
      `Rent: ${fmt(appliedRent)}`,
      `Water: ${fmt(appliedWater)}`,
      `Electricity: ${fmt(appliedElectricity)}`,
      `Outstanding balance: ${fmt(balanceDue)}`,
      `Payment due date: ${dueDate}`,
      ...(paymentInstructions.length ? ['', ...paymentInstructions] : []),
      '',
      'Please contact us if you have any questions about this invoice.',
      'Kind regards,',
      'Property Management',
    ].join('\n');
  };

  const createInvoiceEmailMessage = (invoice: UtilityInvoice) => {
    const message = createInvoiceMessage(invoice);
    if (!propertyEmail) return message;
    return `${message}\n\n${language === 'fr' ? 'E-mail de contact' : 'Contact email'}: ${propertyEmail}`;
  };

  const openInvoiceMessage = (invoice: UtilityInvoice) => {
    setMessageBody(createInvoiceMessage(invoice));
    setMessageInvoice(invoice);
  };

  const sendInvoiceMessage = async () => {
    const body = messageBody.trim();
    const tenantId = messageInvoice?.tenants?.id ?? messageInvoice?.tenant_id;
    if (!user || !tenantId || !body || sendingMessage) return;
    setSendingMessage(true);
    try {
      const conversationType = profile?.role === 'admin' ? 'tenant_admin' : 'manager_tenant';
      let lookup = supabase.from('chat_conversations')
        .select('id')
        .eq('conversation_type', conversationType)
        .eq('tenant_id', tenantId);
      if (conversationType === 'manager_tenant') lookup = lookup.eq('manager_id', user.id);
      const { data: existing, error: lookupError } = await lookup.maybeSingle();
      if (lookupError) throw lookupError;
      let conversationId = existing?.id;
      if (!conversationId) {
        const { data, error } = await supabase.from('chat_conversations')
          .insert({
            conversation_type: conversationType,
            tenant_id: tenantId,
            manager_id: conversationType === 'manager_tenant' ? user.id : null,
          })
          .select('id')
          .single();
        if (error) throw error;
        conversationId = data.id;
      }
      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
      });
      if (error) throw error;
      addToast(language === 'fr' ? 'Message envoyé au locataire.' : 'Message sent to tenant.', 'success');
      setMessageInvoice(null);
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : (language === 'fr' ? 'Échec de l’envoi du message.' : 'Unable to send the message.'), 'error');
    } finally {
      setSendingMessage(false);
    }
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
          language === 'fr' ? 'fr-FR' : 'en-GB',
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
  };

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const pendingInvoices = invoices.filter(invoice => invoice.status === 'unpaid' || invoice.status === 'partial');
  const rentDueTenants = getTenantsDueForInvoice(tenants, invoices, activeLeases, today);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('invoices')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('invoiceRentUtilities')}</p>
        </div>
        {canManageInvoices && (
          <Button className="page-action-button" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>{t('createInvoice')}</Button>
        )}
      </div>

      {canManageInvoices && (
        <section className="invoice-rent-due-panel overflow-hidden rounded-2xl border border-red-200 bg-red-50/50">
          <div className="invoice-rent-due-header flex items-center gap-3 border-b border-red-200 px-5 py-4">
            <CalendarDays className="h-5 w-5 text-amber-700" />
            <div>
              <h2 className="invoice-rent-due-title font-semibold text-slate-900">{t('rentDueThisMonth')}</h2>
              <p className="invoice-rent-due-description mt-0.5 text-sm text-slate-600">{t('rentDueThisMonthDescription')}</p>
            </div>
            <span className="invoice-rent-due-count ml-auto rounded-full border border-red-300 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
              {rentDueTenants.length}
            </span>
          </div>
          {rentDueTenants.length === 0 ? (
            <p className="invoice-rent-due-empty px-5 py-4 text-sm text-slate-600">{t('noRentDue')}</p>
          ) : (
            <div className="invoice-rent-due-list divide-y divide-red-100">
              {rentDueTenants.map(({ tenant, dueDate }) => (
                <div key={tenant.id} className="invoice-rent-due-row flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="invoice-rent-due-tenant font-medium text-slate-900">{tenant.full_name}</p>
                    <p className="invoice-rent-due-meta text-xs text-slate-600">
                      {tenant.houses?.house_number ?? '—'} · {t('invoiceDueDate')}: {new Date(`${dueDate}T00:00:00`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="invoice-rent-due-amount money-value text-sm font-semibold text-red-700">
                      {fmt(Number(activeLeases.find(item => item.tenant_id === tenant.id)?.monthly_rent ?? tenant.monthly_rent ?? 0))}
                    </span>
                    <Button
                      size="sm"
                      className="page-action-button"
                      onClick={() => openCreateForTenant(tenant, currentMonth, dueDate)}
                    >
                      {t('createRentInvoice')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
              {!loading && pendingInvoices.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-500">{t('noPendingInvoices')}</td></tr>}
              {pendingInvoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900">{invoice.invoice_number}</td>
                  <td className="px-5 py-3 text-sm text-slate-700">{invoice.tenants?.full_name ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-slate-700">
                    {new Date(`${invoice.rent_month.slice(0, 7)}-01`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900">
                    <span className="money-value">{fmt(Number(invoice.total_amount))}</span>
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {t('totalBalanceDue')}: <span className="money-value">{fmt(Number(invoice.total_balance_due ?? invoice.rent_balance))}</span>
                    </p>
                    {Number(invoice.rent_credit) > 0 && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {t('rentCredit')}: <span className="money-value">{fmt(Number(invoice.rent_credit))}</span>
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`invoice-status-badge rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : invoice.status === 'partial' ? 'bg-blue-50 text-blue-700' : 'invoice-status-unpaid'}`}>
                      {invoice.status === 'partial' ? t('partiallyUnpaid') : t(invoice.status)}
                    </span>
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
          <MonthPicker
            id="invoice-month"
            value={form.rent_month}
            onChange={month => setForm(current => ({ ...current, rent_month: month }))}
            language={language}
            label={t('invoiceMonth')}
            showLabel
          />
          <Input label={t('rent')} type="number" min="0" step="0.01" value={form.rent_amount} onChange={setField('rent_amount')} />
          <Input label={`${t('additionalCharges')} — ${t('water')}`} type="number" min="0" step="0.01" value={form.water_amount} onChange={setField('water_amount')} />
          <Input label={`${t('additionalCharges')} — ${t('electricity')}`} type="number" min="0" step="0.01" value={form.electricity_amount} onChange={setField('electricity_amount')} />
          <Input label={t('invoiceDueDate')} type="date" value={form.due_date} onChange={setField('due_date')} />
          <div className="sm:col-span-2">
            <Textarea label={t('notes')} value={form.notes} onChange={setField('notes')} rows={3} maxLength={1000} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <span className="font-semibold text-slate-700">{t('totalDue')}</span>
            <span className="text-lg font-bold text-emerald-700 money-value">
              {fmt((Number(form.rent_amount) || 0) + (Number(form.water_amount) || 0) + (Number(form.electricity_amount) || 0))}
            </span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button className="invoice-cancel-button" variant="ghost" onClick={() => setModalOpen(false)}>{t('cancel')}</Button>
          <Button className="page-action-button" loading={saving} onClick={saveInvoice}>{t('saveInvoice')}</Button>
        </div>
      </Modal>}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={t('invoice')} size="lg" className="document-modal invoice-document-modal">
        {viewing && <InvoiceDocument invoice={viewing} />}
        {viewing && canManageInvoices && (
          <div className="invoice-share-actions mt-4 flex flex-wrap items-center gap-2">
            {(() => {
              const phone = normalizePhoneNumber(viewing.tenants?.phone ?? '', '257')?.slice(1);
              const message = createInvoiceMessage(viewing);
              const disabledLinkClasses = 'pointer-events-none opacity-50';
              const linkClasses = 'invoice-share-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold';
              return (
                <>
                  <a
                    href={phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!phone}
                    title={phone ? 'WhatsApp' : (language === 'fr' ? 'Numéro de téléphone indisponible' : 'Phone number unavailable')}
                    className={`${linkClasses} invoice-share-whatsapp ${phone ? '' : disabledLinkClasses}`}
                  >
                    <WhatsAppIcon className="h-4 w-4 text-white" />
                    WhatsApp
                  </a>
                  <a
                    href={viewing.tenants?.email
                      ? `mailto:${viewing.tenants.email}?subject=${encodeURIComponent(`${t('invoice')} ${viewing.invoice_number}`)}&body=${encodeURIComponent(createInvoiceEmailMessage(viewing))}`
                      : undefined}
                    aria-disabled={!viewing.tenants?.email}
                    title={viewing.tenants?.email ? viewing.tenants.email : (language === 'fr' ? 'Adresse e-mail indisponible' : 'Email address unavailable')}
                    className={`${linkClasses} invoice-share-email ${viewing.tenants?.email ? '' : disabledLinkClasses}`}
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Email
                  </a>
                  <Button
                    variant="outline"
                    className="invoice-share-action invoice-share-message rounded-xl px-4 py-2.5"
                    icon={<AndroidMessagesIcon className="h-5 w-5" />}
                    onClick={() => openInvoiceMessage(viewing)}
                  >
                    {language === 'fr' ? 'Message' : 'Message'}
                  </Button>
                </>
              );
            })()}
          </div>
        )}
        <div className="invoice-document-actions mt-4 flex justify-end gap-3">
          <Button className="document-close-button" variant="ghost" onClick={() => setViewing(null)}>{t('closeButton')}</Button>
          <Button className="document-print-button" icon={<Printer className="h-4 w-4" />} onClick={() => printDocument('invoice', 'invoice-print-document')}>{t('printSavePdf')}</Button>
        </div>
      </Modal>

      <Modal
        open={!!messageInvoice}
        onClose={() => setMessageInvoice(null)}
        title={language === 'fr' ? 'Envoyer le récapitulatif de facture' : 'Send invoice summary'}
        size="lg"
      >
        {messageInvoice && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-slate-500">{t('tenant')}</p>
                <p className="mt-1 truncate font-semibold text-slate-800">{messageInvoice.tenants?.full_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t('invoice')}</p>
                <p className="mt-1 font-semibold text-slate-800">{messageInvoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t('totalDue')}</p>
                <p className="mt-1 font-semibold text-slate-800">{fmt(Number(messageInvoice.total_amount))}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t('totalBalanceDue')}</p>
                <p className="mt-1 font-semibold text-red-700">
                  {fmt(messageInvoice.status === 'paid' ? 0 : Number(messageInvoice.total_balance_due ?? messageInvoice.rent_balance))}
                </p>
              </div>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              {language === 'fr'
                ? 'Le message comprend le détail des frais, les paiements appliqués et le solde restant. Vous pouvez le modifier avant l’envoi.'
                : 'The message includes itemized charges, payments applied, and the remaining balance. Review or edit it before sending.'}
            </p>
            <Textarea
              label={language === 'fr' ? 'Message au locataire' : 'Message to tenant'}
              value={messageBody}
              onChange={event => setMessageBody(event.target.value)}
              rows={14}
              maxLength={4000}
              className="text-sm leading-6"
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setMessageInvoice(null)}>{t('cancel')}</Button>
              <Button
                loading={sendingMessage}
                disabled={!messageBody.trim()}
                icon={<AndroidMessagesIcon className="h-5 w-5" />}
                onClick={sendInvoiceMessage}
              >
                {language === 'fr' ? 'Envoyer le message' : 'Send message'}
              </Button>
            </div>
          </>
        )}
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
