import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '@/contexts/ThemeContext';

export interface ReceiptData {
  receipt_number: string;
  payment_date: string;
  rent_month: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  late_fee: number;
  payment_method?: string;
  notes?: string;
  tenants?: { full_name: string; tenant_code: string };
  houses?: { house_number: string };
}

export default function Receipt({ payment }: { payment: ReceiptData }) {
  const [qr, setQr] = useState<string>('');
  const { fmt, appName, appLogoUrl } = useTheme();

  useEffect(() => {
    const payload = [
      `Receipt: ${payment.receipt_number}`,
      `Tenant: ${payment.tenants?.full_name ?? ''}`,
      `House: ${payment.houses?.house_number ?? ''}`,
      `Month: ${payment.rent_month ?? ''}`,
      `Paid: ${fmt(Number(payment.amount_paid))}`,
      `Balance: ${fmt(Number(payment.balance))}`,
      `Method: ${payment.payment_method ?? ''}`,
      `Date: ${payment.payment_date ?? ''}`,
    ].join('\n');
    QRCode.toDataURL(payload, { margin: 1, width: 140, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [payment, fmt]);

  return (
    <div id="receipt-content" className="bg-white text-gray-900 rounded-xl p-6 receipt-print-area">
      <div className="flex items-start justify-between border-b pb-4 mb-4">
        <div className="flex items-center gap-4">
          <img src={appLogoUrl} alt={`${appName} logo`} className="h-14 w-14 object-contain" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{appName}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">PAYMENT RECEIPT</h2>
            <p className="mt-1 text-sm text-gray-500">Official rent payment record</p>
          </div>
        </div>
        {qr && <img src={qr} alt="Receipt QR" className="w-[100px] h-[100px]" />}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
        {[
          ['Receipt No.', payment.receipt_number],
          ['Date', new Date(payment.payment_date).toLocaleDateString()],
          ['Tenant', payment.tenants?.full_name ?? '—'],
          ['Tenant Code', payment.tenants?.tenant_code ?? '—'],
          ['House', payment.houses?.house_number ?? '—'],
          ['Rent Month', new Date(`${payment.rent_month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })],
          ['Method', payment.payment_method?.replace('_', ' ') ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 font-semibold capitalize text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 p-4 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Amount Due</span><span className="font-medium">{fmt(Number(payment.amount_due))}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Late Fee</span><span className="font-medium">{fmt(Number(payment.late_fee ?? 0))}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold"><span>Amount Paid</span><span className="text-green-700">{fmt(Number(payment.amount_paid))}</span></div>
        <div className="flex justify-between text-red-600"><span>Balance</span><span className="font-bold">{fmt(Number(payment.balance))}</span></div>
      </div>

      {payment.notes && (
        <div className="mt-4 border-t pt-3 text-sm">
          <p className="text-gray-400 text-xs mb-1">Notes</p>
          <p className="text-gray-700">{payment.notes}</p>
        </div>
      )}

      <div className="mt-6 flex items-end justify-between border-t border-gray-200 pt-4 text-xs text-gray-500">
        <p>Thank you for your payment</p>
        <p>— Authorized Signature —</p>
      </div>
    </div>
  );
}
