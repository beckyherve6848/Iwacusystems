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
  const { t, fmt } = useTheme();
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
        <p className="text-slate-500 text-sm mt-0.5">View and download your lease agreement</p>
      </div>

      {!agreement ? (
        <div className="rounded-2xl p-12 text-center" style={panelStyle}>
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">No active rental agreement found</p>
          <p className="text-slate-500 text-sm mt-1">Contact your landlord to get your agreement set up</p>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div style={panelStyle}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <FileText className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{agreement.agreement_number}</p>
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium capitalize">
                  {agreement.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-5">
              {[
                { label: 'House', value: agreement.houses?.house_number },
                { label: 'Monthly Rent', value: fmt(Number(agreement.monthly_rent)) },
                { label: 'Start Date', value: new Date(agreement.lease_start_date).toLocaleDateString() },
                { label: 'End Date', value: agreement.lease_end_date ? new Date(agreement.lease_end_date).toLocaleDateString() : 'Ongoing' },
                { label: 'Security Deposit', value: fmt(Number(agreement.security_deposit)) },
                { label: 'Landlord', value: agreement.landlord_signature ?? 'Property Management' },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3" style={{ background: '#f9fafb' }}>
                  <p className="text-slate-500 text-xs mb-0.5">{item.label}</p>
                  <p className={`text-slate-900 font-medium ${item.label === 'Monthly Rent' || item.label === 'Security Deposit' ? 'money-value' : ''}`}>{item.value}</p>
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
                View Full Agreement
              </Button>
              <Button
                icon={<Download className="w-4 h-4" />}
                onClick={handlePrint}
                className="flex-1"
              >
                Download / Print
              </Button>
            </div>
          </div>

          {/* Terms preview */}
          {agreement.terms_and_conditions && (
            <div style={panelStyle}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Terms &amp; Conditions Preview</p>
              <pre className="text-slate-500 text-sm whitespace-pre-wrap font-sans leading-relaxed line-clamp-6 overflow-hidden">
                {agreement.terms_and_conditions}
              </pre>
              <button
                onClick={() => setViewOpen(true)}
                className="text-xs mt-3 transition-colors"
                style={{ color: '#111827' }}
              >
                Read full agreement &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Full view modal */}
      {agreement && (
        <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Your Rental Agreement" size="xl">
          <AgreementDocument agreement={agreement} printId="tenant-agreement-print" />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setViewOpen(false)}>Close</Button>
            <Button icon={<Download className="w-4 h-4" />} onClick={() => printDocument('agreement', 'tenant-agreement-print')}>
              Download / Print
            </Button>
          </div>
        </Modal>
      )}

    </div>
  );
}
