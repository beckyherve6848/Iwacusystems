import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '@/contexts/ThemeContext';
import { Payment } from '@/lib/supabase';

export type ReceiptData = Payment;

export default function Receipt({
  payment,
  invoiceRentDue,
  invoiceWaterDue,
  invoiceElectricityDue,
  invoiceRentBalance,
  invoiceRentCredit,
  invoiceWaterBalance,
  invoiceElectricityBalance,
  invoiceTotalBalance,
}: {
  payment: Payment;
  invoiceRentDue?: number;
  invoiceWaterDue?: number;
  invoiceElectricityDue?: number;
  invoiceRentBalance?: number;
  invoiceRentCredit?: number;
  invoiceWaterBalance?: number;
  invoiceElectricityBalance?: number;
  invoiceTotalBalance?: number;
}) {
  const [qr, setQr] = useState<string>('');
  const { fmt, t, appName, appLogoUrl, language } = useTheme();
  const rentPaid = Number(payment.rent_paid_amount ?? payment.amount_paid);
  const waterPaid = Number(payment.water_paid_amount ?? 0);
  const electricityPaid = Number(payment.electricity_paid_amount ?? 0);
  const rentBalance = invoiceRentBalance ?? Number(payment.balance ?? 0);
  const rentCredit = invoiceRentCredit ?? Math.max(0, -Number(payment.balance));
  const dateLocale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const rentMonth = new Date(`${payment.rent_month.slice(0, 7)}-01`).toLocaleDateString(dateLocale, {
    month: 'long',
    year: 'numeric',
  });
  const paymentDate = new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const recordedAt = new Date(payment.created_at).toLocaleString(dateLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  useEffect(() => {
    const payload = [
      `${t('paymentReceipt')}: ${payment.receipt_number}`,
      `${t('tenant')}: ${payment.tenants?.full_name ?? ''}`,
      `${t('house')}: ${payment.houses?.house_number ?? ''}`,
      `${t('invoiceMonth')}: ${rentMonth}`,
      `${t('rentPaid')}: ${fmt(rentPaid)}`,
      `${t('water')}: ${fmt(waterPaid)}`,
      `${t('electricity')}: ${fmt(electricityPaid)}`,
      `${t('totalPaymentReceived')}: ${fmt(Number(payment.amount_paid))}`,
      `${t('totalBalanceDue')}: ${fmt(invoiceTotalBalance ?? 0)}`,
      `${t('recordedAt')}: ${recordedAt}`,
      ...(payment.recorded_by_name ? [`${t('recordedBy')}: ${payment.recorded_by_name}`] : []),
      ...(payment.recorded_by_phone ? [`${t('phone')}: ${payment.recorded_by_phone}`] : []),
    ].join('\n');
    QRCode.toDataURL(payload, { margin: 1, width: 140, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [payment, fmt, invoiceTotalBalance, rentMonth, rentPaid, waterPaid, electricityPaid, recordedAt, t]);

  const details = [
    { label: t('receiptNumber'), value: payment.receipt_number },
    { label: t('paymentDate'), value: paymentDate },
    { label: t('tenant'), value: payment.tenants?.full_name ?? '—' },
    { label: t('house'), value: payment.houses?.house_number ?? '—' },
    { label: t('invoiceMonth'), value: rentMonth },
    { label: t('paymentMethod'), value: payment.payment_method?.replace(/_/g, ' ') ?? '—' },
  ];

  const charges = [
    { label: t('rent'), due: invoiceRentDue ?? Number(payment.amount_due), paid: rentPaid, balance: rentBalance },
    { label: t('water'), due: invoiceWaterDue ?? Number(payment.water_due_amount ?? 0), paid: waterPaid, balance: invoiceWaterBalance },
    { label: t('electricity'), due: invoiceElectricityDue ?? Number(payment.electricity_due_amount ?? 0), paid: electricityPaid, balance: invoiceElectricityBalance },
  ];

  return (
    <article id="receipt-content" className="receipt-print-area relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-900/10">
      {payment.status === 'paid' && (
        <div aria-hidden="true" className="receipt-paid-watermark pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
          <span className="-rotate-12 whitespace-nowrap text-[5rem] font-black uppercase tracking-[0.2em] text-slate-900 opacity-[0.12] sm:text-[8rem]">
            {t('paid')}
          </span>
        </div>
      )}
      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <img src={appLogoUrl} alt={`${appName} logo`} className="h-16 w-16 shrink-0 object-contain sm:h-[4.5rem] sm:w-[4.5rem]" />
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{appName}</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{t('paymentReceipt')}</h2>
            <p className="text-xs text-slate-500">{t('paymentReceiptSubtitle')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {qr && <img src={qr} alt={t('receiptVerificationCode')} className="receipt-qr hidden h-14 w-14 sm:block" />}
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{t('receiptNumber')}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{payment.receipt_number}</p>
            <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${payment.status === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700'}`}>
              {payment.status === 'paid' ? t('paid') : payment.status === 'partial' ? t('partiallyUnpaid') : t(payment.status)}
            </span>
          </div>
        </div>
      </header>

      <section className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-100 px-5 py-4 text-sm sm:grid-cols-3 sm:px-7">
        {details.slice(1).map(item => (
          <div key={item.label} className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
            <p className="mt-0.5 truncate font-semibold capitalize text-slate-800">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="relative z-10 px-5 py-4 sm:px-7">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2.5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{t('paymentBreakdown')}</h3>
            <span className="text-xs font-medium capitalize text-slate-500">{rentMonth}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="receipt-breakdown w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[26%]" />
                <col className="w-[26%]" />
                <col className="w-[26%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 text-left">{t('description')}</th>
                  <th className="px-2 py-2 text-right">{t('chargeDue')}</th>
                  <th className="px-2 py-2 text-right">{t('paidAmount')}</th>
                  <th className="px-3 py-2 text-right">{t('totalBalanceDue')}</th>
                </tr>
              </thead>
              <tbody>
                {charges.map(charge => (
                  <tr key={charge.label} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{charge.label}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-500">{fmt(charge.due)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums text-slate-800">{fmt(charge.paid)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">{fmt(charge.balance ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{t('totalPaymentReceived')}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-emerald-800">{fmt(Number(payment.amount_paid))}</p>
          </div>
          <div className={`rounded-xl px-4 py-3 ${invoiceTotalBalance === undefined ? 'bg-slate-50' : invoiceTotalBalance > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{t('totalBalanceDue')}</p>
            <p className={`mt-1 text-lg font-extrabold tabular-nums ${invoiceTotalBalance === undefined ? 'text-slate-400' : invoiceTotalBalance > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {fmt(invoiceTotalBalance ?? 0)}
            </p>
          </div>
        </div>
        {rentCredit > 0 && <p className="mt-2 text-right text-xs font-medium text-emerald-700">{t('rentCredit')}: {fmt(rentCredit)}</p>}
        {(Number(payment.late_fee) > 0 || payment.notes) && (
          <div className="mt-3 flex flex-wrap justify-between gap-x-5 gap-y-1 text-xs text-slate-600">
            {Number(payment.late_fee) > 0 && <p>{t('lateFee')}: <span className="font-semibold">{fmt(Number(payment.late_fee))}</span></p>}
            {payment.notes && <p className="max-w-full whitespace-pre-wrap">{t('notes')}: {payment.notes}</p>}
          </div>
        )}
      </section>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[10px] text-slate-500 sm:px-7">
        <div className="w-full border-b border-slate-200 pb-2 text-center font-medium text-slate-600">
          {t('receiptAuthenticityDisclaimer')}
        </div>
        <p>{t('paymentReceiptThankYou')}</p>
        <p>{t('recordedAt')}: {recordedAt}</p>
        {payment.recorded_by_name && <p>{t('recordedBy')}: <span className="font-semibold text-slate-700">{payment.recorded_by_name}</span></p>}
        {payment.recorded_by_phone && <p>{t('phone')}: {payment.recorded_by_phone}</p>}
        <p>{paymentDate}</p>
      </footer>
    </article>
  );
}
