import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FileText, Download, Eye } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import AgreementDocument from '@/components/AgreementDocument';
import { printDocument } from '@/lib/print';

export default function TenantAgreementPage() {
  const { user } = useAuth();
  const { t, fmt, language } = useTheme();
  const [agreement, setAgreement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('tenants').select('id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (!data) { setLoading(false); return; }
      supabase
        .from('rental_agreements')
        .select('*, tenants(full_name, tenant_code), houses(house_number)')
        .eq('tenant_id', data.id)
        .eq('status', 'active')
        .maybeSingle()
        .then(({ data: agr }) => { setAgreement(agr); setLoading(false); });
    });
  }, [user]);

  const handlePrint = () => {
    setViewOpen(true);
    setTimeout(() => printDocument('agreement', 'tenant-agreement-print'), 600);
  };

  const panelStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e9ecef',
    borderRadius: '1rem',
    padding: '1.25rem',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('tenant-agreement')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('tenantAgreementDescription')}</p>
      </div>

      {!agreement ? (
        <div className="dark-theme-surface rounded-2xl p-12 text-center" style={panelStyle}>
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">{t('noActiveRentalAgreement')}</p>
          <p className="text-slate-500 text-sm mt-1">{t('contactLandlordForAgreement')}</p>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="dark-theme-surface" style={panelStyle}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <FileText className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{agreement.agreement_number}</p>
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium capitalize">
                  {t(agreement.status)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-5">
              {[
                { label: t('houseNumber'), value: agreement.houses?.house_number, isMoney: false },
                { label: t('monthlyRentLabel'), value: fmt(Number(agreement.monthly_rent)), isMoney: true },
                { label: t('startDateLabel'), value: new Date(agreement.lease_start_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB'), isMoney: false },
                { label: t('endDateLabel'), value: agreement.lease_end_date ? new Date(agreement.lease_end_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB') : t('ongoing'), isMoney: false },
                { label: t('securityDeposit'), value: fmt(Number(agreement.security_deposit)), isMoney: true },
                { label: t('landlordLabel'), value: agreement.landlord_signature ?? t('propertyManagement'), isMoney: false },
              ].map(item => (
                <div key={item.label} className="dark-theme-subtle-surface rounded-xl p-3" style={{ background: '#f9fafb' }}>
                  <p className="text-slate-500 text-xs mb-0.5">{item.label}</p>
                  <p className={`text-slate-900 font-medium ${item.isMoney ? 'money-value' : ''}`}>{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                icon={<Eye className="w-4 h-4" />}
                onClick={() => setViewOpen(true)}
                className="flex-1"
              >
                {t('viewFullAgreement')}
              </Button>
              <Button
                icon={<Download className="w-4 h-4" />}
                onClick={handlePrint}
                className="flex-1"
              >
                {t('downloadPrint')}
              </Button>
            </div>
          </div>

          {/* Terms preview */}
          {agreement.terms_and_conditions && (
            <div className="dark-theme-surface" style={panelStyle}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t('termsConditionsPreview')}</p>
              <pre className="text-slate-500 text-sm whitespace-pre-wrap font-sans leading-relaxed line-clamp-6 overflow-hidden">
                {agreement.terms_and_conditions}
              </pre>
              <button
                onClick={() => setViewOpen(true)}
                className="text-xs mt-3 transition-colors"
                style={{ color: '#059669' }}
              >
                {t('readFullAgreement')} &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Full view modal */}
      {agreement && (
        <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={t('yourRentalAgreement')} size="xl" className="document-modal">
          <AgreementDocument agreement={agreement} printId="tenant-agreement-print" />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setViewOpen(false)}>{t('closeButton')}</Button>
            <Button icon={<Download className="w-4 h-4" />} onClick={() => printDocument('agreement', 'tenant-agreement-print')}>
              {t('downloadPrint')}
            </Button>
          </div>
        </Modal>
      )}

    </div>
  );
}
