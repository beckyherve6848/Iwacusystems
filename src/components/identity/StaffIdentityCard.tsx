import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { Profile, supabase } from '@/lib/supabase';
import PrivateDocumentLink from '@/components/identity/PrivateDocumentLink';
import { printDocument } from '@/lib/print';
import { DEFAULT_STAFF_CARD_FOOTER, DEFAULT_STAFF_CARD_FOOTER_FR, useTheme } from '@/contexts/ThemeContext';

type StaffProfile = Profile & {
  staff_id?: string | null;
  national_id?: string | null;
  residential_address?: string | null;
  profile_photo_path?: string | null;
  identity_document_path?: string | null;
};

export default function StaffIdentityCard({
  profile,
  assignedProperties,
  showIdentityDocument = true,
}: {
  profile: StaffProfile;
  assignedProperties?: string[];
  showIdentityDocument?: boolean;
}) {
  const { appName, appLogoUrl, propertyPhone, propertyAddress, staffCardFooter, staffCardFooterFr, language } = useTheme();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const cardId = `staff-card-${profile.id}`;
  const french = language === 'fr';
  const cardText = french ? {
    cardType: 'CARTE D’IDENTITÉ',
    staffIdentification: 'IDENTIFICATION DU PERSONNEL',
    caretaker: 'Gardien',
    propertyManager: 'Gestionnaire immobilier',
    staffId: 'MATRICULE',
    pending: 'En attente',
    idPassport: 'ID / Passeport',
    telephone: 'Téléphone',
    email: 'E-mail',
    assignedProperty: 'Propriété attribuée',
    address: 'Adresse résidentielle',
    notProvided: 'Non renseigné',
    staffPhoto: 'PHOTO DU PERSONNEL',
    scan: 'SCANNER POUR LES DÉTAILS',
    printBiometric: 'Imprimer la carte biométrique',
    identityDocument: 'Document ID / Passeport',
    qrUnavailable: 'QR indisponible',
  } : {
    cardType: 'IDENTITY CARD',
    staffIdentification: 'STAFF IDENTIFICATION',
    caretaker: 'Caretaker',
    propertyManager: 'Property Manager',
    staffId: 'STAFF ID',
    pending: 'Pending',
    idPassport: 'ID / Passport',
    telephone: 'Telephone',
    email: 'Email',
    assignedProperty: 'Assigned property',
    address: 'Residential address',
    notProvided: 'Not provided',
    staffPhoto: 'STAFF PHOTO',
    scan: 'SCAN FOR DETAILS',
    printBiometric: 'Print biometric card',
    identityDocument: 'ID / Passport document',
    qrUnavailable: 'QR unavailable',
  };
  const roleLabel = profile.role === 'caretaker' ? cardText.caretaker : cardText.propertyManager;
  const properties = profile.role === 'caretaker'
    ? profile.assigned_property_name || assignedProperties?.[0]?.split(' · ')[0] || 'Not assigned'
    : assignedProperties?.length
      ? assignedProperties.join(', ')
      : profile.assigned_property_name || 'Not assigned';
  const selectedFooter = french ? staffCardFooterFr : staffCardFooter;
  const footerMessage = (selectedFooter || (french ? DEFAULT_STAFF_CARD_FOOTER_FR : DEFAULT_STAFF_CARD_FOOTER))
    .replace(/\{phone\}/g, propertyPhone || (french ? 'veuillez contacter le bureau de gestion immobilière' : 'please contact the Property Management Office'))
    .replace(/\{address\}/g, propertyAddress || (french ? 'le bureau de gestion immobilière' : 'the Property Management Office'))
    .replace(/\{property\}/g, properties);
  const qrPayload = [
    french ? 'CARTE D’IDENTITÉ DU PERSONNEL' : 'STAFF IDENTITY CARD',
    `${french ? 'Nom complet' : 'Full name'}: ${profile.full_name || cardText.notProvided}`,
    `${cardText.staffId}: ${profile.staff_id || cardText.pending}`,
    `${french ? 'Fonction' : 'Role'}: ${roleLabel}`,
    `${cardText.idPassport}: ${profile.national_id || cardText.notProvided}`,
    `${cardText.telephone}: ${profile.phone || cardText.notProvided}`,
    `${cardText.email}: ${profile.email || cardText.notProvided}`,
    `${cardText.assignedProperty}: ${properties}`,
    `${cardText.address}: ${profile.residential_address || cardText.notProvided}`,
  ].join('\n');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrPayload, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
    }).then(url => {
    if (cancelled) return;
    setQrCodeUrl(url);
    setQrError(null);
    }).catch((caught: unknown) => {
    if (cancelled) return;
    setQrCodeUrl(null);
    setQrError(caught instanceof Error ? caught.message : 'Unable to create the staff-details QR code.');
    });
    return () => { cancelled = true; };
  }, [qrPayload]);

  useEffect(() => {
    let cancelled = false;
    if (!profile.profile_photo_path) {
      setPhotoUrl(null);
      setPhotoError(null);
      return;
    }
    supabase.storage.from('identity-documents').createSignedUrl(profile.profile_photo_path, 300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setPhotoError(error.message);
        else setPhotoUrl(data.signedUrl);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setPhotoError(caught instanceof Error ? caught.message : 'The secure profile photo could not be loaded.');
      });
    return () => { cancelled = true; };
  }, [profile.profile_photo_path]);

  const printCard = () => {
    setPrintError(null);
    try {
      printDocument('staff-card', cardId);
    } catch (caught) {
      setPrintError(caught instanceof Error ? caught.message : 'Unable to print the staff card.');
    }
  };

  return (
    <section className="staff-identity-panel">
      <article id={cardId} className="staff-id-card" aria-label={`${roleLabel} staff ID card`}>
        <header className="staff-id-card__header">
          <div className="staff-id-card__brand">
            {appLogoUrl && <img className="staff-id-card__brand-logo" src={appLogoUrl} alt={`${appName} logo`} />}
            <span className="staff-id-card__brand-name">{properties}</span>
          </div>
          <div className="staff-id-card__heading">
            <span>{cardText.staffIdentification}</span>
            <h2>{cardText.cardType}</h2>
          </div>
          <span className="staff-id-card__header-accent" aria-hidden="true" />
        </header>

        <div className="staff-id-card__body">
          <div className="staff-id-card__portrait-wrap">
            {photoUrl
              ? <img src={photoUrl} alt={`${profile.full_name} profile`} className="staff-id-card__portrait" />
              : <div className="staff-id-card__portrait staff-id-card__portrait--empty">
                <span>{profile.full_name.trim().charAt(0).toUpperCase() || 'M'}</span>
                <small>{cardText.staffPhoto}</small>
              </div>}
          </div>

          <div className="staff-id-card__details">
            <p className="staff-id-card__role">{roleLabel}</p>
            <h1 className="staff-id-card__name" title={profile.full_name}>{profile.full_name || 'Staff member'}</h1>
            <div className="staff-id-card__staff-number">
              <span>{cardText.staffId}</span>
              <strong>{profile.staff_id || cardText.pending}</strong>
            </div>

            <dl className="staff-id-card__facts">
              <div>
                <dt>{cardText.idPassport}</dt>
                <dd title={profile.national_id || undefined}>{profile.national_id || cardText.notProvided}</dd>
              </div>
              <div>
                <dt>{cardText.telephone}</dt>
                <dd title={profile.phone || undefined}>{profile.phone || cardText.notProvided}</dd>
              </div>
              <div className="staff-id-card__fact--wide">
                <dt>{cardText.email}</dt>
                <dd title={profile.email || undefined}>{profile.email || cardText.notProvided}</dd>
              </div>
              <div className="staff-id-card__fact--wide staff-id-card__property">
                <dt>{cardText.assignedProperty}</dt>
                <dd title={properties}>{properties}</dd>
              </div>
              <div className="staff-id-card__fact--wide">
                <dt>{cardText.address}</dt>
                <dd title={profile.residential_address || undefined}>{profile.residential_address || cardText.notProvided}</dd>
              </div>
            </dl>
          </div>
          <div className="staff-id-card__qr">
            {qrCodeUrl
              ? <img src={qrCodeUrl} alt={`QR code containing ${profile.full_name}'s staff identity details`} />
              : <span>{cardText.qrUnavailable}</span>}
            <small>{cardText.scan}</small>
          </div>
        </div>

        <footer className="staff-id-card__footer">
          <div className="staff-id-card__lost">
            {footerMessage.split('\n').map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}
          </div>
          <span className="staff-id-card__footer-id">{profile.staff_id || cardText.staffId}</span>
        </footer>
      </article>

      <div className="staff-identity-panel__actions">
        <button type="button" onClick={printCard} className="staff-id-card__print-button">
          <Printer aria-hidden="true" size={16} />
          {cardText.printBiometric}
        </button>
        {showIdentityDocument && (
          <div className="staff-id-card__document">
            <span>{cardText.identityDocument}</span>
            <PrivateDocumentLink path={profile.identity_document_path} label={french ? 'Document ID / Passeport PDF' : 'ID / Passport PDF'} />
          </div>
        )}
      </div>
      {photoError && <p role="alert" className="mt-2 text-xs text-red-700">Unable to load profile photo: {photoError}</p>}
      {qrError && <p role="alert" className="mt-2 text-xs text-red-700">Unable to generate staff QR code: {qrError}</p>}
      {printError && <p role="alert" className="mt-2 text-xs text-red-700">{printError}</p>}
    </section>
  );
}
