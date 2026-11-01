import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileDown, Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useTheme } from '@/contexts/ThemeContext';
import { printDocument } from '@/lib/print';

interface HouseOccupant {
  tenant_code: string;
  full_name: string;
  phone: string;
  email: string;
  national_id: string | null;
  gender: string | null;
  move_in_date: string | null;
  monthly_rent: number | null;
}

function ReportSection({ title, data, columns, houseReport = false }: {
  title: string;
  data: any[];
  columns: { key: string; label: string; format?: (v: any, row: any) => string }[];
  houseReport?: boolean;
}) {
  const { appName, appLogoUrl, t, language } = useTheme();
  const printId = `report-print-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const exportCSV = () => {
    const header = columns.map(c => c.label).join(',');
    const rows = data.map(row =>
      columns.map(c => {
        const val = c.format ? c.format(row[c.key], row) : row[c.key];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    printDocument('report', printId);
  };

  return (
    <div id={printId} className={`report-print-area bg-white border border-slate-200 rounded-2xl overflow-hidden${houseReport ? ' report-house-list' : ''}`}>
      <div className="report-document-header hidden items-center justify-between border-b border-slate-300 px-5 py-4">
        <div className="flex items-center gap-3">
          <img src={appLogoUrl} alt="" className="h-12 w-12 object-contain" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{appName}</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
          </div>
        </div>
        <p className="text-right text-xs text-slate-500">{t('generated')} {new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')}</p>
      </div>
      <div className="no-print flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" icon={<FileDown className="w-3.5 h-3.5" />} onClick={exportCSV}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={exportPDF}>
            Export PDF
          </Button>
        </div>
      </div>
      {houseReport && (
        <div className="report-house-print-list">
          {data.map((row, index) => (
            <article key={row.id ?? row.house_number ?? index} className="report-house-print-card">
              <h3 className="report-house-print-title">{row.house_number}</h3>
              <dl className="report-house-print-details">
                {columns.filter(column => column.key !== 'house_number').map(column => {
                  const value = column.format
                    ? column.format(row[column.key], row)
                    : String(row[column.key] ?? '—');
                  return (
                    <div key={column.key} className="report-house-print-field">
                      <dt>{column.label}</dt>
                      <dd>{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          ))}
          {data.length === 0 && <p className="report-house-print-empty">{t('noData')}</p>}
        </div>
      )}
      <div className="report-table-view overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              {columns.map(c => (
                <th key={c.key} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 && (
              <tr><td colSpan={columns.length} className="text-center py-8 text-slate-500">{t('noData')}</td></tr>
            )}
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {columns.map(c => (
                  <td key={c.key} className="px-5 py-3 text-sm text-slate-700">
                    {c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 text-xs text-slate-500 border-t border-slate-200/20">
        {data.length} {t('records')}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { fmt: fmtCurrency, t, language } = useTheme();
  const [activeReport, setActiveReport] = useState('payments');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [houseStatusFilter, setHouseStatusFilter] = useState('all');
  const [reportError, setReportError] = useState<string | null>(null);

  const reports = [
    { id: 'payments', label: t('rentCollection') },
    { id: 'outstanding', label: t('outstandingRent') },
    { id: 'houses', label: t('houseList') },
    { id: 'tenants', label: t('tenantList') },
    { id: 'visitors', label: t('visitorLog') },
    { id: 'maintenance', label: t('maintenance') },
  ];

  useEffect(() => { loadReport(activeReport); }, [activeReport, filterMonth, houseStatusFilter]);

  const loadReport = async (type: string) => {
    setLoading(true);
    setReportError(null);
    try {
      let data: any[] = [];

      if (type === 'payments') {
        const { data: rows, error } = await supabase
          .from('payments')
          .select('receipt_number, payment_date, rent_month, amount_due, amount_paid, balance, late_fee, status, payment_method, tenants(full_name, tenant_code), houses(house_number)')
          .gte('rent_month', filterMonth + '-01')
          .lt('rent_month', (() => {
            const [y, m] = filterMonth.split('-').map(Number);
            return new Date(y, m, 1).toISOString().slice(0, 10);
          })())
          .order('payment_date', { ascending: false });
        if (error) throw error;
        data = rows ?? [];
      } else if (type === 'outstanding') {
        const { data: rows, error } = await supabase
          .from('payments')
          .select('receipt_number, rent_month, amount_due, amount_paid, balance, status, tenants(full_name, tenant_code), houses(house_number)')
          .neq('status', 'paid')
          .order('rent_month');
        if (error) throw error;
        data = rows ?? [];
      } else if (type === 'houses') {
        let houseQuery = supabase
          .from('houses')
          .select('id, house_number, floor, status, monthly_rent, security_deposit, house_categories(name)')
          .order('house_number');
        if (houseStatusFilter !== 'all') {
          houseQuery = houseQuery.eq('status', houseStatusFilter);
        }
        const { data: houses, error: housesError } = await houseQuery;
        if (housesError) throw housesError;

        const houseIds = (houses ?? []).map(house => house.id);
        const { data: tenants, error: tenantsError } = houseIds.length
          ? await supabase
            .from('tenants')
            .select('house_id, tenant_code, full_name, phone, email, national_id, gender, move_in_date, monthly_rent')
            .in('house_id', houseIds)
            .eq('status', 'active')
            .order('full_name')
          : { data: [], error: null };
        if (tenantsError) throw tenantsError;
        data = (houses ?? []).map(house => ({
          ...house,
          occupants: (tenants ?? []).filter(tenant => tenant.house_id === house.id),
        }));
      } else if (type === 'tenants') {
        const { data: rows, error } = await supabase
          .from('tenants')
          .select('tenant_code, full_name, phone, email, gender, status, move_in_date, monthly_rent, houses(house_number)')
          .order('full_name');
        if (error) throw error;
        data = rows ?? [];
      } else if (type === 'visitors') {
        const { data: rows, error } = await supabase
          .from('visitors')
          .select('visitor_name, phone, national_id, purpose, vehicle_registration, time_in, time_out, status, houses(house_number), tenants(full_name)')
          .order('time_in', { ascending: false })
          .limit(200);
        if (error) throw error;
        data = rows ?? [];
      } else if (type === 'maintenance') {
        const { data: rows, error } = await supabase
          .from('maintenance_requests')
          .select('title, priority, status, assigned_to, created_at, updated_at, tenants(full_name), houses(house_number)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        data = rows ?? [];
      }

      setReportData(data);
    } catch (caught) {
      setReportData([]);
      setReportError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: any) => v != null ? fmtCurrency(Number(v)) : '—';
  const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—';
  const fmtDateTime = (v: string) => v ? new Date(v).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—';
  const fmtMonth = (v: string) => v ? new Date(v).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' }) : '—';
  const fmtStatus = (value: string) => {
    const statusKeys: Record<string, string> = {
      in_progress: 'inProgressStatus',
      approved: 'approvedStatus',
      completed: 'completedStatus',
      rejected: 'rejectedStatus',
      expired: 'expiredStatus',
      terminated: 'terminatedStatus',
    };
    return t(statusKeys[value] ?? value);
  };

  const columnDefs: Record<string, { key: string; label: string; format?: (v: any, row: any) => string }[]> = {
    payments: [
      { key: 'receipt_number', label: t('paymentReceiptHeader') },
      { key: 'tenants', label: t('tenant'), format: (_, r) => r.tenants?.full_name ?? '—' },
      { key: 'houses', label: t('house'), format: (_, r) => r.houses?.house_number ?? '—' },
      { key: 'rent_month', label: t('rentMonth'), format: fmtMonth },
      { key: 'payment_date', label: t('maintenanceDateLabel'), format: fmtDate },
      { key: 'amount_due', label: t('due'), format: fmt },
      { key: 'amount_paid', label: t('paid'), format: fmt },
      { key: 'balance', label: t('reportBalance'), format: fmt },
      { key: 'status', label: t('status'), format: fmtStatus },
      { key: 'payment_method', label: t('paymentMethodLabel'), format: v => v ? t(({ cash: 'cashPayment', bank_deposit: 'bankDepositPayment', bank_transfer: 'bankTransferPayment', mobile_money: 'mobileMoneyPayment' } as Record<string, string>)[v] ?? v) : '—' },
    ],
    outstanding: [
      { key: 'tenants', label: t('tenant'), format: (_, r) => r.tenants?.full_name ?? '—' },
      { key: 'houses', label: t('house'), format: (_, r) => r.houses?.house_number ?? '—' },
      { key: 'rent_month', label: t('rentMonth'), format: fmtMonth },
      { key: 'amount_due', label: t('due'), format: fmt },
      { key: 'amount_paid', label: t('paid'), format: fmt },
      { key: 'balance', label: t('reportOutstanding'), format: fmt },
      { key: 'status', label: t('status'), format: fmtStatus },
    ],
    houses: [
      { key: 'house_number', label: t('houseNo') },
      { key: 'house_categories', label: t('category'), format: (_, r) => r.house_categories?.name ?? '—' },
      { key: 'floor', label: t('floor') },
      { key: 'status', label: t('status'), format: fmtStatus },
      { key: 'occupant_name', label: t('tenantName'), format: (_, r: { occupants: HouseOccupant[]; status: string }) => r.occupants.map(tenant => tenant.full_name).join('; ') || (r.status === 'vacant' ? t('vacant') : language === 'fr' ? 'Aucun locataire actif' : 'No active tenant') },
      { key: 'occupant_code', label: t('id'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => tenant.tenant_code).join('; ') || '—' },
      { key: 'occupant_national_id', label: t('nationalId'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => tenant.national_id ?? '—').join('; ') || '—' },
      { key: 'occupant_phone', label: t('phoneLabel'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => tenant.phone).join('; ') || '—' },
      { key: 'occupant_email', label: t('emailLabel'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => tenant.email).join('; ') || '—' },
      { key: 'occupant_gender', label: t('gender'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => tenant.gender ?? '—').join('; ') || '—' },
      { key: 'occupant_move_in', label: t('moveInDate'), format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => fmtDate(tenant.move_in_date ?? '')).join('; ') || '—' },
      { key: 'occupant_rent', label: language === 'fr' ? 'Loyer du locataire' : 'Tenant rent', format: (_, r: { occupants: HouseOccupant[] }) => r.occupants.map(tenant => fmt(tenant.monthly_rent)).join('; ') || '—' },
      { key: 'monthly_rent', label: t('rentLabel'), format: fmt },
      { key: 'security_deposit', label: t('deposit'), format: fmt },
    ],
    tenants: [
      { key: 'tenant_code', label: t('id') },
      { key: 'full_name', label: t('tenantName') },
      { key: 'phone', label: t('phoneLabel') },
      { key: 'email', label: t('emailLabel') },
      { key: 'gender', label: t('gender') },
      { key: 'houses', label: t('house'), format: (_, r) => r.houses?.house_number ?? '—' },
      { key: 'move_in_date', label: t('moveInDate'), format: fmtDate },
      { key: 'monthly_rent', label: t('rentLabel'), format: fmt },
      { key: 'status', label: t('status'), format: fmtStatus },
    ],
    visitors: [
      { key: 'visitor_name', label: t('visitor') },
      { key: 'phone', label: t('phoneLabel') },
      { key: 'houses', label: t('house'), format: (_, r) => r.houses?.house_number ?? '—' },
      { key: 'tenants', label: t('tenant'), format: (_, r) => r.tenants?.full_name ?? '—' },
      { key: 'purpose', label: t('purposeOfVisitLabel') },
      { key: 'vehicle_registration', label: t('vehicleLabel') },
      { key: 'time_in', label: t('timeIn'), format: fmtDateTime },
      { key: 'time_out', label: t('timeOut'), format: fmtDateTime },
      { key: 'status', label: t('status'), format: fmtStatus },
    ],
    maintenance: [
      { key: 'tenants', label: t('tenant'), format: (_, r) => r.tenants?.full_name ?? '—' },
      { key: 'houses', label: t('house'), format: (_, r) => r.houses?.house_number ?? '—' },
      { key: 'title', label: t('reportTitleLabel') },
      { key: 'priority', label: t('priority'), format: v => t(v) },
      { key: 'status', label: t('status'), format: fmtStatus },
      { key: 'assigned_to', label: t('assignedToLabel') },
      { key: 'created_at', label: t('maintenanceDateLabel'), format: fmtDate },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t('reportsTitle')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('reportsDescription')}</p>
      </div>

      {/* Report Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {reports.map(r => (
          <button
            key={r.id}
            onClick={() => setActiveReport(r.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeReport === r.id ? 'bg-blue-600 text-slate-900' : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Month filter for payment reports */}
      {(activeReport === 'payments') && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-500">{t('filterByMonth')}</label>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-white border border-slate-200 text-slate-900 rounded-xl py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>
      )}

      {activeReport === 'houses' && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="house-report-status" className="text-sm text-slate-500">
            {language === 'fr' ? 'Statut du logement :' : 'House status:'}
          </label>
          <select
            id="house-report-status"
            className="house-report-status-filter rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={houseStatusFilter}
            onChange={event => setHouseStatusFilter(event.target.value)}
          >
            <option value="all">{language === 'fr' ? 'Tous' : 'All'}</option>
            <option value="occupied">{t('occupied')}</option>
            <option value="vacant">{t('vacant')}</option>
          </select>
        </div>
      )}

      {reportError ? (
        <div role="alert" className="report-load-error rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {language === 'fr' ? 'Impossible de charger le rapport :' : 'Unable to load report:'} {reportError}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ReportSection
          title={reports.find(r => r.id === activeReport)?.label ?? ''}
          data={reportData}
          columns={columnDefs[activeReport] ?? []}
          houseReport={activeReport === 'houses'}
        />
      )}
    </div>
  );
}
