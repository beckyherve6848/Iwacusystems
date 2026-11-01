import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Home, Users, TrendingUp, AlertCircle, Wallet,
  UserCheck, Wrench, ArrowUpRight, CheckCircle2,
  Building2, StickyNote
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';
import { calculateOutstandingInvoiceBalance } from '@/lib/invoiceBalances';

interface Stats {
  totalHouses: number;
  occupiedHouses: number;
  vacantHouses: number;
  maintenanceHouses: number;
  totalTenants: number;
  totalFamilyMembers: number;
  monthlyExpectedRent: number;
  monthlyCollected: number;
  outstandingRent: number;
  totalInvoices: number | null;
  unpaidInvoices: number;
  visitorsToday: number;
  recentPayments: any[];
  recentVisitors: any[];
  recentMaintenance: any[];
  monthlyIncome: { month: string; amount: number }[];
  paymentStatusCounts: { status: string; count: number }[];
}

function StatCard({ icon: Icon, title, label, value, sub, onClick, iconStyle, moneyAmount, outstanding = false }: {
  icon: any; title: string; label: string; value: string | number; sub?: string; onClick?: () => void;
  iconStyle: string;
  moneyAmount?: number;
  outstanding?: boolean;
}) {
  const isMoney = moneyAmount !== undefined;
  const moneySizeClass = moneyAmount !== undefined && moneyAmount >= 1_000_000_000
    ? 'phone-dashboard-money-billion'
    : moneyAmount !== undefined && moneyAmount >= 100_000_000
      ? 'phone-dashboard-money-hundred-million'
      : '';
  const moneyColorClass = outstanding
    ? moneyAmount && moneyAmount > 0
      ? 'phone-dashboard-outstanding-positive'
      : 'phone-dashboard-outstanding-zero'
    : 'phone-dashboard-collected';

  return (
    <div
      onClick={onClick}
      className={`min-w-0 bg-white border border-[#eaeaea] rounded-2xl p-3 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all group ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''}`}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`phone-stat-icon w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${iconStyle}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.75} />
          </div>
          <span className="phone-stat-title block truncate text-xs font-semibold text-slate-500 md:hidden">{title}</span>
        </div>
        {onClick && <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />}
      </div>
      <p className={`min-w-0 text-lg sm:text-2xl font-bold mb-1 leading-tight ${isMoney ? `phone-dashboard-money ${moneyColorClass} ${moneySizeClass}` : 'text-slate-900'}`}>{value}</p>
      <p className="phone-stat-description min-w-0 border-l border-[#ff0000] pl-2 text-xs italic leading-5 text-slate-500 md:hidden">
        <span className="block">{label}</span>
        {sub && <span className="block text-slate-400">{sub}</span>}
      </p>
      <p className="hidden text-xs font-medium leading-4 text-slate-500 sm:text-sm sm:leading-5 md:block">{label}</p>
      {sub && <p className="hidden text-xs text-slate-400 mt-1 md:block">{sub}</p>}
    </div>
  );
}

type AdminOverviewItem = {
  label: string;
  value: string;
  page: string;
  color: string;
};

function ringSectorPath(index: number, count: number, outerRadius: number, innerRadius: number) {
  const startAngle = (index * 360) / count - 90 - 180 / count;
  const endAngle = startAngle + 360 / count;
  const point = (radius: number, angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: 200 + radius * Math.cos(radians), y: 200 + radius * Math.sin(radians) };
  };
  const outerStart = point(outerRadius, startAngle);
  const outerEnd = point(outerRadius, endAngle);
  const innerEnd = point(innerRadius, endAngle);
  const innerStart = point(innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function AdminOverviewDiagram({
  items,
  onNavigate,
  centerLabel,
  language,
}: {
  items: AdminOverviewItem[];
  onNavigate: (page: string) => void;
  centerLabel: string;
  language: string;
}) {
  const { loginFamilyImageUrl } = useTheme();
  const ringRef = useRef<SVGGElement | null>(null);
  const rotationRef = useRef(0);
  const lastPointerAngleRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);

  const getPointerAngle = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    return Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    draggedRef.current = false;
    draggingRef.current = true;
    lastPointerAngleRef.current = getPointerAngle(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || lastPointerAngleRef.current === null) return;
    const angle = getPointerAngle(event);
    let delta = angle - lastPointerAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 1) draggedRef.current = true;
    rotationRef.current += delta;
    lastPointerAngleRef.current = angle;
    ringRef.current?.setAttribute('transform', `rotate(${rotationRef.current} 200 200)`);
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    lastPointerAngleRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className="phone-overview-card relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 z-0 md:hidden" aria-hidden="true">
        <img src={loginFamilyImageUrl || '/Bck.png'} alt="" className="h-full w-full object-cover object-center" />
        <div className="phone-overview-gradient absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/75 to-slate-800/90" />
      </div>
      <div className="relative z-10 mb-4">
        <h2 className="phone-overview-heading text-base font-semibold text-slate-900">{centerLabel}</h2>
        <p className="phone-overview-description mt-1 text-xs text-slate-500">
          {language === 'fr' ? 'Sélectionnez une section pour ouvrir sa page.' : 'Select a section to open its admin page.'}
        </p>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[320px]">
        <svg
          viewBox="0 0 400 400"
          role="group"
          aria-label={centerLabel}
          className="h-auto w-full overflow-visible cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g ref={ringRef} className="phone-overview-ring">
          {items.map((item, index) => {
            const middleAngle = (index * 360) / items.length - 90;
            const radians = (middleAngle * Math.PI) / 180;
            const labelRadius = 122;
            const x = 200 + labelRadius * Math.cos(radians);
            const y = 200 + labelRadius * Math.sin(radians);
            return (
              <g
                key={item.page}
                role="button"
                tabIndex={0}
                aria-label={`${item.label}: ${item.value}`}
                className="cursor-pointer outline-none"
                onClick={event => {
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  onNavigate(item.page);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onNavigate(item.page);
                  }
                }}
              >
                <path
                  d={ringSectorPath(index, items.length, 168, 78)}
                  fill={item.color}
                  stroke="white"
                  strokeWidth="3"
                  className="phone-overview-segment transition-[filter,transform,opacity] duration-200 hover:opacity-90 focus:opacity-90"
                />
                <text
                  x={x}
                  y={y - 3}
                  textAnchor="middle"
                  className="pointer-events-none fill-white text-[9px] font-semibold"
                >
                  <tspan x={x}>{item.label}</tspan>
                  <tspan x={x} dy="12" className="text-[8px] font-medium opacity-85">{item.value}</tspan>
                </text>
              </g>
            );
          })}
          </g>
          <circle cx="200" cy="200" r="74" fill="#111827" />
          <text x="200" y="195" textAnchor="middle" className="fill-white text-xs font-bold">
            {language === 'fr' ? 'Gestion' : 'Property'}
          </text>
          <text x="200" y="216" textAnchor="middle" className="fill-slate-300 text-xs">
            {language === 'fr' ? 'immobilière' : 'Management'}
          </text>
        </svg>
      </div>
    </section>
  );
}

function LineChart({ data, noDataLabel, fmtCurrency }: { data: { month: string; amount: number }[]; noDataLabel: string; fmtCurrency: (n: number) => string }) {
  if (!data.length) return <p className="text-slate-400 text-sm text-center py-8">{noDataLabel}</p>;
  const max = Math.max(...data.map(d => d.amount), 1);
  const w = 100;
  const h = 100;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => ({ x: i * step, y: h - (d.amount / max) * (h - 10) - 4 }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;
  return (
    <div className="w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-40 overflow-visible">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.25)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
          <pattern id="incomeNetwork" width="34" height="30" patternUnits="userSpaceOnUse">
            <path
              d="M0 4L12 10L23 2M12 10L7 25L23 18L34 27M23 2L23 18M0 4L7 25"
              fill="none"
              stroke="rgba(16,185,129,0.16)"
              strokeWidth="0.55"
            />
            <circle cx="0" cy="4" r="1" fill="rgba(16,185,129,0.22)" />
            <circle cx="12" cy="10" r="1.1" fill="rgba(16,185,129,0.24)" />
            <circle cx="23" cy="2" r="0.9" fill="rgba(16,185,129,0.18)" />
            <circle cx="7" cy="25" r="0.9" fill="rgba(16,185,129,0.2)" />
            <circle cx="23" cy="18" r="1" fill="rgba(16,185,129,0.2)" />
            <circle cx="34" cy="27" r="0.9" fill="rgba(16,185,129,0.17)" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#incomeNetwork)" />
        <path d={areaD} fill="url(#lineGrad)" />
        <path d={pathD} fill="none" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill="#10b981" stroke="#fff" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex items-end justify-between mt-2 px-1">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5" style={{ flex: 1 }}>
            <span className="text-[10px] font-semibold text-slate-700 hidden sm:block">{fmtCurrency(d.amount)}</span>
            <span className="text-[10px] text-slate-400">{d.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  paid: 'bg-emerald-500',
  pending: 'bg-amber-500',
  partial: 'bg-blue-500',
  overdue: 'bg-red-500',
  outstanding: 'bg-red-500',
};

const panelClass = 'bg-white border border-slate-200 rounded-2xl';

export default function AdminDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { t, fmt, language } = useTheme();
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);
  const [pendingRegistrationError, setPendingRegistrationError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalHouses: 0, occupiedHouses: 0, vacantHouses: 0, maintenanceHouses: 0,
    totalTenants: 0, totalFamilyMembers: 0, monthlyExpectedRent: 0,
    monthlyCollected: 0, outstandingRent: 0, totalInvoices: null, unpaidInvoices: 0, visitorsToday: 0,
    recentPayments: [], recentVisitors: [], recentMaintenance: [],
    monthlyIncome: [], paymentStatusCounts: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const [houses, tenants, family, payments, visitors, maintenance, invoices, unpaidInvoices, invoiceBalances, utilityPayments] = await Promise.all([
        supabase.from('houses').select('id, status, monthly_rent'),
        supabase.from('tenants').select('id, status'),
        supabase.from('tenant_family').select('id'),
        supabase.from('payments').select('id, amount_paid, rent_paid_amount, amount_due, status, rent_month, tenants(full_name), houses(house_number), payment_date, receipt_number').order('created_at', { ascending: false }).limit(50),
        supabase.from('visitors').select('id, visitor_name, purpose, time_in, status, houses(house_number)').order('time_in', { ascending: false }).limit(5),
        supabase.from('maintenance_requests').select('id, title, priority, status, tenants(full_name), houses(house_number), created_at').order('created_at', { ascending: false }),
        supabase.from('utility_invoices').select('id', { count: 'exact', head: true }),
        supabase.from('utility_invoices').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'partial']),
        supabase.from('utility_invoices').select('id, tenant_id, rent_month, rent_balance, water_amount, electricity_amount'),
        supabase.from('payments').select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount'),
      ]);

      if (invoices.error || unpaidInvoices.error) {
        console.error('Unable to load invoice summary:', invoices.error?.message ?? unpaidInvoices.error?.message);
      }
      if (invoiceBalances.error || utilityPayments.error) {
        console.error('Unable to load outstanding invoice balance:', invoiceBalances.error?.message ?? utilityPayments.error?.message);
      }
      const houseData = houses.data ?? [];
      const tenantData = tenants.data ?? [];
      const paymentData = payments.data ?? [];

      const occupied = houseData.filter(h => h.status === 'occupied').length;
      const vacant = houseData.filter(h => h.status === 'vacant').length;
      const maint = (maintenance.data ?? []).filter(m => m.status !== 'completed' && m.status !== 'rejected').length;
      const activeTenants = tenantData.filter(t => t.status === 'active');

      // Current month in YYYY-MM format
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Only count payments for the current month for expected/collected
      const thisMonthPayments = paymentData.filter(p =>
        p.rent_month && p.rent_month.slice(0, 7) === currentMonth
      );

      const collected = thisMonthPayments.reduce((s, p) => s + Number(p.amount_paid), 0);
      const outstanding = invoiceBalances.error || utilityPayments.error
        ? 0
        : calculateOutstandingInvoiceBalance(invoiceBalances.data ?? [], utilityPayments.data ?? []);

      const visitorsToday = (visitors.data ?? []).filter(v =>
        new Date(v.time_in) >= todayStart
      ).length;

      const monthlyMap: Record<string, number> = {};
      paymentData.forEach(p => {
        if (!p.rent_month) return;
        const key = p.rent_month.slice(0, 7);
        monthlyMap[key] = (monthlyMap[key] ?? 0) + Number(p.amount_paid);
      });
      const monthlyIncome = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([k, v]) => ({
          month: new Date(k + '-01').toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }),
          amount: v,
        }));

      const statusMap: Record<string, number> = {};
      paymentData.forEach(p => { statusMap[p.status] = (statusMap[p.status] ?? 0) + 1; });
      const paymentStatusCounts = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

      setStats({
        totalHouses: houseData.length,
        occupiedHouses: occupied,
        vacantHouses: vacant,
        maintenanceHouses: maint,
        totalTenants: activeTenants.length,
        totalFamilyMembers: family.data?.length ?? 0,
        monthlyExpectedRent: houseData.filter(h => h.status === 'occupied').reduce((s, h) => s + Number(h.monthly_rent), 0),
        monthlyCollected: collected,
        outstandingRent: outstanding,
        totalInvoices: invoices.error ? null : invoices.count ?? 0,
        unpaidInvoices: unpaidInvoices.error ? 0 : unpaidInvoices.count ?? 0,
        visitorsToday,
        recentPayments: paymentData.slice(0, 5),
        recentVisitors: visitors.data ?? [],
        recentMaintenance: maintenance.data ?? [],
        monthlyIncome,
        paymentStatusCounts,
      });
      setLoading(false);
    }
    void load();
    const channel = supabase
      .channel('admin-dashboard-invoice-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utility_invoices' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [language]);

  const loadPendingRegistrations = useCallback(async () => {
    const [{ data: profiles, error: profileError }, { data: tenants, error: tenantError }] = await Promise.all([
      supabase.from('profiles').select('id').eq('role', 'tenant').eq('is_active', true),
      supabase.from('tenants').select('user_id').not('user_id', 'is', null),
    ]);
    const error = profileError ?? tenantError;
    if (error) {
      console.error('Unable to load pending registrations:', error.message);
      setPendingRegistrationError(error.message);
      return;
    }
    const linkedUserIds = new Set((tenants ?? []).map(tenant => tenant.user_id));
    setPendingRegistrationCount((profiles ?? []).filter(account => !linkedUserIds.has(account.id)).length);
    setPendingRegistrationError(null);
  }, []);

  useEffect(() => {
    loadPendingRegistrations();
    const channel = supabase
      .channel('admin-pending-registration-alert')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadPendingRegistrations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, loadPendingRegistrations)
      .subscribe();
    const interval = window.setInterval(loadPendingRegistrations, 30_000);
    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadPendingRegistrations]);

  const overviewItems: AdminOverviewItem[] = [
    { label: language === 'fr' ? 'Maisons' : 'Houses', value: String(stats.totalHouses), page: 'houses', color: '#2563eb' },
    { label: language === 'fr' ? 'Locataires' : 'Tenants', value: String(stats.totalTenants), page: 'tenants', color: '#7c3aed' },
    { label: language === 'fr' ? 'Paiements' : 'Payments', value: String(stats.paymentStatusCounts.reduce((sum, item) => sum + item.count, 0)), page: 'payments', color: '#059669' },
    { label: language === 'fr' ? 'Entretien' : 'Maint.', value: String(stats.maintenanceHouses), page: 'maintenance', color: '#dc2626' },
    { label: language === 'fr' ? 'Factures' : 'Invoices', value: String(stats.unpaidInvoices), page: 'invoices', color: '#4f46e5' },
    { label: language === 'fr' ? 'Visiteurs' : 'Visitors', value: String(stats.visitorsToday), page: 'visitors', color: '#0891b2' },
    { label: language === 'fr' ? 'Baux' : 'Leases', value: language === 'fr' ? 'Ouvrir' : 'Open', page: 'agreements', color: '#d97706' },
    { label: language === 'fr' ? 'Rapports' : 'Reports', value: language === 'fr' ? 'Ouvrir' : 'Open', page: 'reports', color: '#475569' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="dashboard-content flex flex-col gap-4 sm:gap-6">
      <DashboardWelcomeHero title={t('dashboard')} subtitle={t('welcomeBackMsg')} />

      <div className="-mx-4 -mt-4 space-y-4 rounded-t-3xl bg-slate-200 px-4 pb-4 pt-5 sm:mx-0 sm:mt-0 sm:space-y-6 sm:rounded-none sm:bg-transparent sm:p-0">
      {pendingRegistrationError && (
        <div role="alert" className="pending-registration-error rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:p-4">
          Unable to check pending registrations: {pendingRegistrationError}
        </div>
      )}

      {pendingRegistrationCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('tenants')}
          className="pending-registration-card flex w-full items-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-left shadow-sm transition-colors hover:bg-red-100 sm:gap-4 sm:p-5"
        >
          <span className="pending-registration-icon flex h-9 w-9 shrink-0 items-center justify-center text-red-700 sm:h-12 sm:w-12">
            <Users className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </span>
          <span className="pending-registration-content min-w-0 flex-1">
            <span className="pending-registration-header">
              <span className="pending-registration-title">{t('pendingRegistrations')}</span>
              <span className="pending-registration-count">{pendingRegistrationCount}</span>
              <span className="pending-registration-action shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">
                {t('reviewRegistrations')}
              </span>
            </span>
            <span className="pending-registration-message">{t('pendingRegistrationsMessage')}</span>
          </span>
        </button>
      )}

      {stats.unpaidInvoices > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="flex w-full items-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-left shadow-sm transition-colors hover:bg-red-100 sm:gap-4 sm:p-5"
        >
          <AlertCircle className="h-10 w-10 shrink-0 text-red-600 sm:h-12 sm:w-12" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-red-800">
              {stats.unpaidInvoices} {language === 'fr' ? 'factures impayées' : 'unpaid invoices'}
            </span>
            <span className="mt-1 block text-sm text-red-700">
              {language === 'fr' ? 'Consultez les factures impayées ou partiellement payées.' : 'Review unpaid or partially paid invoices.'}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">
            {language === 'fr' ? 'Voir les factures' : 'View invoices'}
          </span>
        </button>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard icon={Building2} title={t('houses')} label={t('totalHouses')} value={stats.totalHouses} iconStyle="bg-blue-50 text-blue-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={CheckCircle2} title={t('houses')} label={t('occupied')} value={stats.occupiedHouses} iconStyle="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={Home} title={t('houses')} label={t('vacant')} value={stats.vacantHouses} iconStyle="bg-amber-50 text-amber-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={Wrench} title={t('maintenance')} label={t('maintenanceHouses')} value={stats.maintenanceHouses} iconStyle="bg-red-50 text-red-700" onClick={() => onNavigate('maintenance')} />
        <StatCard icon={Users} title={t('tenants')} label={t('activeTenants')} value={stats.totalTenants} sub={`${stats.totalFamilyMembers} ${t('familyMembers')}`} iconStyle="bg-violet-50 text-violet-700" onClick={() => onNavigate('tenants')} />
        <StatCard icon={Wallet} title={t('payments')} label={t('expectedRent')} value={fmt(stats.monthlyExpectedRent)} moneyAmount={stats.monthlyExpectedRent} iconStyle="bg-sky-50 text-sky-700" onClick={() => onNavigate('payments')} />
        <StatCard icon={TrendingUp} title={t('payments')} label={t('collected')} value={fmt(stats.monthlyCollected)} moneyAmount={stats.monthlyCollected} iconStyle="bg-green-50 text-green-700" onClick={() => onNavigate('payments')} />
        <StatCard icon={AlertCircle} title={t('payments')} label={t('outstanding')} value={fmt(stats.outstandingRent)} moneyAmount={stats.outstandingRent} outstanding iconStyle="bg-red-50 text-red-700" onClick={() => onNavigate('payments')} />
        <StatCard
          icon={StickyNote}
          title={t('invoices')}
          label={t('invoices')}
          value={stats.totalInvoices ?? '—'}
          sub={stats.totalInvoices === null ? undefined : `${stats.unpaidInvoices} ${t('unpaid')}`}
          iconStyle="bg-indigo-50 text-indigo-700"
          onClick={() => onNavigate('invoices')}
        />
        <StatCard icon={UserCheck} title={t('visitors')} label={t('visitorsToday')} value={stats.visitorsToday} iconStyle="bg-cyan-50 text-cyan-700" onClick={() => onNavigate('visitors')} />
      </div>

      <AdminOverviewDiagram
        items={overviewItems}
        onNavigate={onNavigate}
        centerLabel={language === 'fr' ? 'Vue d’ensemble' : 'Admin overview'}
        language={language}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className={`lg:col-span-2 p-3 sm:p-5 ${panelClass}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('monthlyIncome')}</h3>
              <p className="text-slate-400 text-xs">{t('last6months')}</p>
            </div>
          </div>
          <LineChart data={stats.monthlyIncome} noDataLabel={t('noDataYet')} fmtCurrency={fmt} />
        </div>

        <div className={`p-3 sm:p-5 ${panelClass}`}>
          <h3 className="text-slate-900 font-semibold text-sm sm:text-base mb-1">{t('paymentStatus')}</h3>
          <p className="text-slate-400 text-xs mb-4">{t('currentBreakdown')}</p>
          {stats.paymentStatusCounts.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">{t('noPaymentsYet')}</p>
          ) : (
            <div className="space-y-3">
              {stats.paymentStatusCounts.map(({ status, count }) => {
                const total = stats.paymentStatusCounts.reduce((s, x) => s + x.count, 0);
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow-sm ${statusColors[status] ?? 'bg-slate-400'}`} />
                        <span className="text-sm capitalize text-slate-700">{t(status)}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
                      <div className={`h-full rounded-full ${statusColors[status] ?? 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Recent Payments */}
        <div className={`p-3 sm:p-5 ${panelClass}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('recentPayments')}</h3>
            <button onClick={() => onNavigate('payments')} className="text-xs font-medium text-slate-900 hover:underline">{t('viewAll')}</button>
          </div>
          <div className="space-y-3">
            {stats.recentPayments.length === 0 && <p className="text-slate-400 text-sm">{t('noPaymentsYet')}</p>}
            {stats.recentPayments.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100">
                  <Wallet className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 truncate">{(p.tenants as any)?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{(p.houses as any)?.house_number} · {p.receipt_number}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                  p.status === 'partial' ? 'bg-blue-50 text-blue-700' :
                  p.status === 'overdue' ? 'bg-red-50 text-red-700' :
                  'bg-amber-50 text-amber-700'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Visitors */}
        <div className={`p-3 sm:p-5 ${panelClass}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('recentVisitors')}</h3>
            <button onClick={() => onNavigate('visitors')} className="text-xs font-medium text-slate-900 hover:underline">{t('viewAll')}</button>
          </div>
          <div className="space-y-3">
            {stats.recentVisitors.length === 0 && <p className="text-slate-400 text-sm">{t('noVisitorsYet')}</p>}
            {stats.recentVisitors.map(v => (
              <div key={v.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100">
                  <UserCheck className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 truncate">{v.visitor_name}</p>
                  <p className="text-xs text-slate-400 truncate">{(v.houses as any)?.house_number} · {v.purpose}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  v.status === 'inside' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>{v.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Maintenance */}
        <div className={`p-3 sm:p-5 ${panelClass}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('maintenanceRequests')}</h3>
            <button onClick={() => onNavigate('maintenance')} className="text-xs font-medium text-slate-900 hover:underline">{t('viewAll')}</button>
          </div>
          <div className="space-y-3">
            {stats.recentMaintenance.length === 0 && <p className="text-slate-400 text-sm">{t('noRequestsYet')}</p>}
            {stats.recentMaintenance.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  m.priority === 'high' ? 'bg-red-50' : m.priority === 'medium' ? 'bg-amber-50' : 'bg-slate-100'
                }`}>
                  <Wrench className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 truncate">{m.title}</p>
                  <p className="text-xs text-slate-400 truncate">{(m.tenants as any)?.full_name} · {(m.houses as any)?.house_number}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                  m.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                  'bg-blue-50 text-blue-700'
                }`}>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
