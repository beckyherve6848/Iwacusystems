import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { UtilityInvoice } from '@/lib/supabase';

export default function InvoiceDocument({
  invoice,
  id = 'invoice-print-document',
}: {
  invoice: UtilityInvoice;
  id?: string;
}) {
  const { appName, appLogoUrl, propertyPhone, propertyAddress, fmt, t, language } = useTheme();
  const month = new Date(`${invoice.rent_month.slice(0, 7)}-01`).toLocaleDateString(
    language === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'long', year: 'numeric' },
  );

  const dateLocale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dueDate = new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const issueDate = new Date(invoice.created_at).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <article id={id} className="invoice-document rounded-2xl bg-white p-6 text-slate-900 sm:p-9">
      <header className="invoice-header flex items-start justify-between gap-5 border-b-2 border-red-600 pb-6">
        <div className="flex min-w-0 items-center gap-4">
          <img src={appLogoUrl} alt={`${appName} logo`} className="h-16 w-16 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold uppercase tracking-[0.14em] text-slate-800">{appName}</p>
            <p className="mt-1 text-xs text-slate-500">{language === 'fr' ? 'Gestion immobilière' : 'Property management'}</p>
            {(propertyAddress || propertyPhone) && (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {[propertyAddress, propertyPhone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">{t('invoice')}</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{invoice.invoice_number}</p>
          <span className={`invoice-status mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {t(invoice.status)}
          </span>
        </div>
      </header>

      <section className="invoice-parties mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="invoice-panel rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('tenant')}</p>
          <p className="mt-2 text-base font-bold text-slate-900">{invoice.tenants?.full_name ?? '—'}</p>
          {invoice.tenants?.tenant_code && <p className="mt-1 text-xs text-slate-500">{invoice.tenants.tenant_code}</p>}
          <p className="mt-2 text-xs text-slate-600">
            {t('house')}: <span className="font-semibold">{invoice.houses?.house_number ?? invoice.tenants?.houses?.house_number ?? '—'}</span>
          </p>
        </div>
        <div className="invoice-panel rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('invoiceDetails')}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <span className="text-slate-500">{t('invoiceMonth')}</span>
            <span className="text-right font-semibold capitalize">{month}</span>
            <span className="text-slate-500">{t('invoiceDueDate')}</span>
            <span className="text-right font-semibold">{dueDate}</span>
            <span className="text-slate-500">{t('issuedOn')}</span>
            <span className="text-right font-semibold">{issueDate}</span>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          {language === 'fr' ? 'Détail des frais' : 'Charges breakdown'}
        </h2>
        <table className="invoice-items w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3 font-semibold">{t('description')}</th>
              <th className="px-4 py-3 text-right font-semibold">{language === 'fr' ? 'Montant' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody>
            {[
              [t('rent'), invoice.rent_amount],
              [t('water'), invoice.water_amount],
              [t('electricity'), invoice.electricity_amount],
            ].map(([label, amount]) => (
              <tr key={label} className="border-b border-slate-100">
                <td className="px-4 py-4 font-medium">{label}</td>
                <td className="px-4 py-4 text-right tabular-nums">{fmt(Number(amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="invoice-total-row">
              <td className="px-4 py-4 text-sm font-bold">{t('totalDue')}</td>
              <td className="px-4 py-4 text-right text-lg font-extrabold tabular-nums">{fmt(Number(invoice.total_amount))}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {invoice.notes && (
        <section className="invoice-notes mt-6 rounded-xl border border-slate-200 p-4 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('notes')}</p>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{invoice.notes}</p>
        </section>
      )}

      <footer className="invoice-footer mt-8 border-t border-slate-200 pt-4">
        <p className="text-sm font-semibold text-slate-800">
          {invoice.status === 'paid'
            ? (language === 'fr' ? 'Merci pour votre paiement.' : 'Thank you for your payment.')
            : (language === 'fr' ? 'Veuillez régler cette facture avant la date d’échéance.' : 'Please settle this invoice by the due date.')}
        </p>
        <p className="mt-3 text-[10px] text-slate-400">
          {language === 'fr' ? 'Facture générée le' : 'Invoice generated on'} {issueDate} · {appName}
        </p>
      </footer>
    </article>
  );
}
