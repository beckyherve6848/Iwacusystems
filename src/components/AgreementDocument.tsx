import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '@/contexts/ThemeContext';

interface AgreementDocProps {
  agreement: any;
  printId?: string;
}

function useQR(text: string, canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    if (!canvasRef.current || !text) return;
    QRCode.toCanvas(canvasRef.current, text, {
      width: 96,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [text, canvasRef]);
}

export default function AgreementDocument({ agreement, printId = 'agreement-print' }: AgreementDocProps) {
  const { fmt, appName, appLogoUrl, language, t } = useTheme();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const text = language === 'fr' ? {
    officialDocument: 'Document officiel',
    rentalAgreement: 'CONTRAT DE LOCATION',
    agreementNumber: 'N° du contrat',
    dated: 'Date',
    landlordProperty: 'Propriétaire / Bien immobilier',
    propertyManagement: 'Gestion immobilière',
    tenant: 'Locataire',
    id: 'ID',
    propertyHouse: 'Bien / Logement',
    leaseStart: 'Date de début du bail',
    leaseEnd: 'Date de fin du bail',
    rent: 'Loyer mensuel',
    deposit: 'Dépôt de garantie',
    status: 'Statut',
    terms: 'Conditions générales',
    landlordSignature: 'Signature du propriétaire',
    tenantSignature: 'Signature du locataire',
    verify: 'Scanner pour vérifier l’authenticité',
    antiTamper: 'Avis contre la falsification :',
    notice: 'Ce document comporte un code QR unique lié au contrat {number}. Toute modification après sa délivrance le rend invalide. Le code QR contient les conditions originales, qui peuvent être vérifiées dans les registres officiels.',
  } : {
    officialDocument: 'Official Document',
    rentalAgreement: 'RENTAL AGREEMENT',
    agreementNumber: 'Agreement No',
    dated: 'Dated',
    landlordProperty: 'Landlord / Property',
    propertyManagement: 'Property Management',
    tenant: 'Tenant',
    id: 'ID',
    propertyHouse: 'Property / House',
    leaseStart: 'Lease Start Date',
    leaseEnd: 'Lease End Date',
    rent: 'Monthly Rent',
    deposit: 'Security Deposit',
    status: 'Status',
    terms: 'Terms & Conditions',
    landlordSignature: 'Landlord Signature',
    tenantSignature: 'Tenant Signature',
    verify: 'Scan to verify authenticity',
    antiTamper: 'Anti-Tampering Notice:',
    notice: 'This document bears a unique QR code linked to agreement {number}. Any modification after issuance renders it invalid. The QR code encodes the original terms and can be verified against the official records.',
  };

  // QR payload: agreement number + tenant + date — acts as a verification fingerprint
  const qrPayload = [
    `AGR:${agreement.agreement_number}`,
    `TEN:${agreement.tenants?.tenant_code ?? ''}`,
    `HSE:${agreement.houses?.house_number ?? ''}`,
    `RENT:${agreement.monthly_rent}`,
    `START:${agreement.lease_start_date}`,
  ].join('|');

  useQR(qrPayload, qrRef);

  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const today = new Date(agreement.created_at ?? Date.now()).toLocaleDateString(locale, {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div
      id={printId}
      className="agreement-print-document"
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        background: 'white',
        color: '#111',
        padding: '40px 48px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
          <img src={appLogoUrl} alt={`${appName} logo`} style={{ width: 52, height: 52, objectFit: 'contain' }} />
          <div>
            <p style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#333', fontWeight: 700, margin: 0 }}>
              {appName}
            </p>
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#777', margin: '3px 0 0' }}>
              {text.officialDocument}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 2px' }}>{text.rentalAgreement}</h1>
          <p style={{ fontSize: 12, color: '#444', margin: 0 }}>{text.agreementNumber}: <strong>{agreement.agreement_number}</strong></p>
          <p style={{ fontSize: 11, color: '#777', margin: '2px 0 0' }}>{text.dated}: {today}</p>
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', background: '#f8f8f8', borderRadius: 6, border: '1px solid #ddd' }}>
          <p style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: '#555', margin: '0 0 6px' }}>{text.landlordProperty}</p>
          <p style={{ margin: 0 }}>{agreement.landlord_signature ?? text.propertyManagement}</p>
        </div>
        <div style={{ padding: '12px 16px', background: '#f8f8f8', borderRadius: 6, border: '1px solid #ddd' }}>
          <p style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: '#555', margin: '0 0 6px' }}>{text.tenant}</p>
          <p style={{ margin: 0 }}>{agreement.tenants?.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#666' }}>{text.id}: {agreement.tenants?.tenant_code}</p>
        </div>
      </div>

      {/* Details table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 12 }}>
        <tbody>
          {[
            [text.propertyHouse, agreement.houses?.house_number],
            [text.leaseStart, new Date(agreement.lease_start_date).toLocaleDateString(locale)],
            [text.leaseEnd, agreement.lease_end_date ? new Date(agreement.lease_end_date).toLocaleDateString(locale) : t('ongoing')],
            [text.rent, fmt(Number(agreement.monthly_rent))],
            [text.deposit, fmt(Number(agreement.security_deposit))],
            [text.status, agreement.status === 'active' ? t('active') : agreement.status === 'expired' ? t('expiredStatus') : agreement.status === 'terminated' ? t('terminatedStatus') : agreement.status],
          ].map(([label, value]) => (
            <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '7px 10px', color: '#555', fontWeight: 600, width: 200 }}>{label}</td>
              <td style={{ padding: '7px 10px', fontWeight: label === text.rent ? 700 : 400 }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Terms */}
      {agreement.terms_and_conditions && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#333', borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 8 }}>
            {text.terms}
          </p>
          <pre style={{ fontFamily: 'inherit', fontSize: 12, whiteSpace: 'pre-wrap', color: '#333', margin: 0, lineHeight: 1.7 }}>
            {agreement.terms_and_conditions}
          </pre>
        </div>
      )}

      {/* Signatures + QR */}
      <div style={{ borderTop: '2px solid #111', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #555', height: 36, marginBottom: 4 }} />
            <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{agreement.landlord_signature ?? '______________________'}</p>
            <p style={{ fontSize: 10, color: '#777', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>{text.landlordSignature}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #555', height: 36, marginBottom: 4 }} />
            <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{agreement.tenant_signature ?? agreement.tenants?.full_name ?? '______________________'}</p>
            <p style={{ fontSize: 10, color: '#777', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>{text.tenantSignature}</p>
          </div>
        </div>

        {/* QR Code */}
        <div style={{ marginLeft: 24, textAlign: 'center' }}>
          <canvas ref={qrRef} style={{ display: 'block', width: 96, height: 96 }} />
          <p style={{ fontSize: 9, color: '#999', margin: '4px 0 0', maxWidth: 96, textAlign: 'center', lineHeight: 1.3 }}>
            {text.verify}
          </p>
        </div>
      </div>

      {/* Anti-tamper notice */}
      <div style={{ marginTop: 20, padding: '10px 14px', background: '#fffbea', border: '1px solid #f0c040', borderRadius: 6 }}>
        <p style={{ fontSize: 10, color: '#7a5c00', margin: 0, lineHeight: 1.5 }}>
          <strong>{text.antiTamper}</strong> {text.notice.replace('{number}', agreement.agreement_number)}
        </p>
      </div>
    </div>
  );
}
