import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Home, Users, TrendingUp, AlertCircle, Wallet, CalendarDays, ChevronLeft, ChevronRight,
  UserCheck, Wrench, ArrowUpRight, CheckCircle2,
  Building2, StickyNote
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ADMIN_OVERVIEW_QUOTE_COLORS } from '@/lib/adminOverviewQuotes';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';
import { calculateInvoiceChargeBalances } from '@/lib/invoiceBalances';
import { getTenantsDueForInvoice, getTenantsNotDueForInvoice } from '@/lib/invoiceDue';

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
  invoicesToCreate: number;
  unpaidInvoices: number;
  visitorsToday: number;
  recentPayments: any[];
  recentVisitors: any[];
  recentMaintenance: any[];
  monthlyIncome: { month: string; amount: number }[];
  paymentStatusCounts: { status: string; count: number }[];
}

const EMPTY_STATS: Stats = {
  totalHouses: 0, occupiedHouses: 0, vacantHouses: 0, maintenanceHouses: 0,
  totalTenants: 0, totalFamilyMembers: 0, monthlyExpectedRent: 0,
  monthlyCollected: 0, outstandingRent: 0, invoicesToCreate: 0, unpaidInvoices: 0, visitorsToday: 0,
  recentPayments: [], recentVisitors: [], recentMaintenance: [],
  monthlyIncome: [], paymentStatusCounts: [],
};

const dashboardStatsCache = new Map<string, Stats>();

function StatCard({ icon: Icon, title, label, value, sub, onClick, iconStyle, moneyAmount, amountTone, iconOnly = false }: {
  icon: any; title: string; label: string; value: string | number; sub?: string; onClick?: () => void;
  iconStyle: string;
  moneyAmount?: number;
  amountTone?: 'expected' | 'collected' | 'outstanding';
  iconOnly?: boolean;
}) {
  const isMoney = moneyAmount !== undefined;
  const moneySizeClass = moneyAmount !== undefined && moneyAmount >= 1_000_000_000
    ? 'phone-dashboard-money-billion'
    : moneyAmount !== undefined && moneyAmount >= 100_000_000
      ? 'phone-dashboard-money-hundred-million'
      : '';
  const moneyColorClass = `phone-dashboard-${amountTone ?? 'expected'}`;
  const formattedMoney = isMoney && typeof value === 'string'
    ? value.match(/^(.+?)\s+([0-9][0-9,]*(?:\.[0-9]+)?)$/)
    : null;
  const fittedAmountFontSize = formattedMoney
    ? `${Math.max(12, Math.min(24, 240 / formattedMoney[2].length))}px`
    : undefined;

  return (
    <div
      onClick={onClick}
      className={`min-w-0 bg-white border border-[#eaeaea] rounded-2xl p-3 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all group ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''}`}
    >
      <div className="flex h-9 items-center justify-between mb-3 sm:h-10 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`phone-stat-icon flex items-center justify-center ${
            amountTone === 'outstanding' || iconOnly
              ? 'phone-stat-icon-outstanding h-9 w-9 shrink-0 rounded-full bg-transparent p-0 sm:h-10 sm:w-10'
              : `h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 ${iconStyle}`
          }`}>
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${amountTone === 'outstanding' || iconOnly ? 'text-amber-700' : ''}`} strokeWidth={1.75} />
          </div>
          <span className="phone-stat-title block truncate text-xs font-semibold text-slate-500 md:hidden">{title}</span>
        </div>
        {onClick && <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />}
      </div>
      <p className={`min-w-0 text-lg sm:text-2xl font-bold mb-1 leading-tight ${isMoney ? `phone-dashboard-money ${moneyColorClass} ${moneySizeClass}` : 'text-slate-900'}`}>
        {formattedMoney ? (
          <>
            <span className="mb-1 block font-mono text-base font-semibold leading-tight sm:text-lg">{formattedMoney[1]}</span>
            <span className="block tabular-nums" style={{ fontSize: fittedAmountFontSize }}>{formattedMoney[2]}</span>
          </>
        ) : value}
      </p>
      <p className="phone-stat-description min-w-0 border-l border-amber-600 pl-2 text-xs italic leading-5 text-slate-500 md:hidden">
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
  const { loginFamilyImageUrl, adminOverviewPhotoUrls, adminOverviewPhotoQuotes } = useTheme();
  const ringRef = useRef<SVGGElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselTransitionEnabled, setCarouselTransitionEnabled] = useState(true);
  const rotationRef = useRef(0);
  const lastPointerAngleRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const lastCenterTapRef = useRef(0);
  const spinAnimationRef = useRef<Animation | null>(null);
  const defaultPhoto = loginFamilyImageUrl || '/Bck.png';
  const carouselPhotos = adminOverviewPhotoUrls.length > 0
    ? adminOverviewPhotoUrls
    : Array.from({ length: 5 }, () => defaultPhoto);
  const carouselTrackPhotos = [
    carouselPhotos[carouselPhotos.length - 1],
    ...carouselPhotos,
    carouselPhotos[0],
  ];
  const activeCarouselIndex = ((carouselIndex % carouselPhotos.length) + carouselPhotos.length) % carouselPhotos.length;
  const activeQuote = adminOverviewPhotoQuotes[activeCarouselIndex];
  const quoteColor = ADMIN_OVERVIEW_QUOTE_COLORS.find(color => color.value === activeQuote?.color)?.hex ?? '#008000';

  useEffect(() => {
    if (carouselPhotos.length < 2) return;
    const timer = window.setInterval(() => {
      setCarouselIndex(index => index + 1);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [carouselPhotos.length]);

  useEffect(() => {
    setCarouselIndex(0);
    setCarouselTransitionEnabled(false);
    const frame = window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [carouselPhotos.length]);

  const handleCarouselTransitionEnd = () => {
    if (carouselIndex >= carouselPhotos.length) {
      setCarouselTransitionEnabled(false);
      setCarouselIndex(0);
      window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    } else if (carouselIndex < 0) {
      setCarouselTransitionEnabled(false);
      setCarouselIndex(carouselPhotos.length - 1);
      window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    }
  };

  const showPreviousPhoto = () => setCarouselIndex(index => index - 1);
  const showNextPhoto = () => setCarouselIndex(index => index + 1);
  const showPhoto = (index: number) => {
    setCarouselTransitionEnabled(false);
    setCarouselIndex(index);
    window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
  };

  const spinRingOnce = () => {
    if (!ringRef.current || spinAnimationRef.current) return;
    const startRotation = rotationRef.current;
    const endRotation = startRotation + 360;
    const ring = ringRef.current;
    ring.style.transformBox = 'view-box';
    ring.style.transformOrigin = '50% 50%';
    ring.style.transform = `rotate(${startRotation}deg)`;
    const animation = ring.animate(
      [
        { transform: `rotate(${startRotation}deg)` },
        { transform: `rotate(${endRotation}deg)` },
      ],
      { duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    spinAnimationRef.current = animation;
    animation.onfinish = () => {
      rotationRef.current = endRotation;
      ring.style.transform = `rotate(${endRotation}deg)`;
      spinAnimationRef.current = null;
    };
    animation.oncancel = () => {
      spinAnimationRef.current = null;
    };
  };

  const getPointerAngle = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    return Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') {
      if (event.target instanceof Element && event.target.closest('[data-spin-center]')) {
        event.stopPropagation();
        const now = performance.now();
        if (now - lastCenterTapRef.current <= 350) {
          lastCenterTapRef.current = 0;
          spinRingOnce();
        } else {
          lastCenterTapRef.current = now;
        }
      }
      return;
    }
    if (event.target instanceof Element && event.target.closest('[data-spin-center]')) {
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastCenterTapRef.current <= 350) {
        lastCenterTapRef.current = 0;
        spinRingOnce();
      } else {
        lastCenterTapRef.current = now;
      }
      return;
    }
    event.preventDefault();
    draggedRef.current = false;
    draggingRef.current = true;
    lastPointerAngleRef.current = getPointerAngle(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || lastPointerAngleRef.current === null) return;
    if (spinAnimationRef.current) return;
    const angle = getPointerAngle(event);
    let delta = angle - lastPointerAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 1) draggedRef.current = true;
    rotationRef.current += delta;
    lastPointerAngleRef.current = angle;
    if (ringRef.current) {
      ringRef.current.style.transformBox = 'view-box';
      ringRef.current.style.transformOrigin = '50% 50%';
      ringRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    lastPointerAngleRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className="phone-overview-card relative isolate overflow-hidden rounded-none border border-green-500 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <img src={loginFamilyImageUrl || '/Bck.png'} alt="" className="phone-overview-background h-full w-full object-cover object-center" />
        <div className="phone-overview-gradient absolute inset-0" />
      </div>
      <div className="phone-overview-copy relative z-10 mb-4">
        <h2 className="phone-overview-heading text-base font-semibold text-white">{centerLabel}</h2>
        <p className="phone-overview-description mt-1 text-xs text-slate-100">
          {language === 'fr' ? 'Sélectionnez une section pour ouvrir sa page.' : 'Select a section to open its admin page.'}
        </p>
      </div>
      <div className="phone-overview-layout relative z-10">
        <aside className="phone-overview-quotes hidden lg:flex" aria-label={language === 'fr' ? 'Citations sur le logement' : 'Property management quotes'}>
          <p className="phone-overview-side-title">{language === 'fr' ? 'Le logement, avec soin' : 'Better homes, better living'}</p>
          {(
            language === 'fr'
              ? [
                '« Un logement accueillant commence par une gestion attentive. »',
                '« Prendre soin des lieux, c’est prendre soin des personnes. »',
                '« Chaque maison mérite attention, confiance et respect. »',
              ]
              : [
                '“A welcoming home begins with thoughtful management.”',
                '“Caring for a place means caring for the people in it.”',
                '“Every home deserves attention, trust, and respect.”',
              ]
          ).map(quote => (
            <blockquote key={quote} className="phone-overview-quote">{quote}</blockquote>
          ))}
        </aside>
        <div className="mx-auto w-full max-w-[320px]">
        <svg
          viewBox="0 0 400 400"
          role="group"
          aria-label={centerLabel}
          className="h-auto w-full overflow-visible cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'pan-y' }}
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
          <g
            data-spin-center
            role="button"
            tabIndex={0}
            aria-label={language === 'fr' ? 'Appuyez deux fois ou appuyez sur Entrée pour faire tourner la roue' : 'Double-tap or press Enter to spin the wheel once'}
            className="cursor-pointer"
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                spinRingOnce();
              }
            }}
          >
            <circle cx="200" cy="200" r="74" fill="#111827" />
            <text x="200" y="195" textAnchor="middle" className="pointer-events-none fill-white text-xs font-bold">
              {language === 'fr' ? 'Gestion' : 'Property'}
            </text>
            <text x="200" y="216" textAnchor="middle" className="pointer-events-none fill-slate-300 text-xs">
              {language === 'fr' ? 'immobilière' : 'Management'}
            </text>
          </g>
        </svg>
        </div>
        <aside className="phone-overview-carousel" aria-label={language === 'fr' ? 'Photos de la propriété' : 'Property photo carousel'}>
          <div className="phone-overview-carousel-heading">
            <h3>{language === 'fr' ? 'Nos espaces' : 'Our spaces'}</h3>
            <p>{language === 'fr' ? 'Des lieux où il fait bon vivre' : 'Places made for living well'}</p>
          </div>
          <div className="phone-overview-photo-frame">
            <div
              className={`phone-overview-photo-track ${carouselTransitionEnabled ? 'is-animated' : ''}`}
              style={{
                width: `${carouselTrackPhotos.length * 100}%`,
                transform: `translateX(-${(carouselIndex + 1) * (100 / carouselTrackPhotos.length)}%)`,
              }}
              onTransitionEnd={handleCarouselTransitionEnd}
            >
              {carouselTrackPhotos.map((photo, index) => (
                <div
                  key={`${photo}-${index}`}
                  className="phone-overview-photo-slide"
                  style={{ width: `${100 / carouselTrackPhotos.length}%` }}
                >
                  <img
                    src={photo}
                    alt={language === 'fr' ? 'Photo de la propriété' : 'Property'}
                    draggable={false}
                    onContextMenu={event => event.preventDefault()}
                  />
                </div>
              ))}
            </div>
            {carouselPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label={language === 'fr' ? 'Photo précédente' : 'Previous photo'}
                  onClick={showPreviousPhoto}
                  className="phone-overview-carousel-arrow left-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={language === 'fr' ? 'Photo suivante' : 'Next photo'}
                  onClick={showNextPhoto}
                  className="phone-overview-carousel-arrow right-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {activeQuote?.text.trim() && (
            <p className="phone-overview-photo-quote" style={{ color: quoteColor }} aria-live="polite">
              “{activeQuote.text}”
            </p>
          )}
          {carouselPhotos.length > 1 && (
            <div className="phone-overview-carousel-dots" aria-label={`${carouselPhotos.length} photos`}>
              {carouselPhotos.map((photo, index) => (
                <button
                  key={`${photo}-${index}`}
                  type="button"
                  aria-label={`${language === 'fr' ? 'Afficher la photo' : 'Show photo'} ${index + 1}`}
                  aria-current={index === activeCarouselIndex}
                  onClick={() => showPhoto(index)}
                  className={`phone-overview-carousel-dot ${index === activeCarouselIndex ? 'is-active' : ''}`}
                />
              ))}
            </div>
          )}
        </aside>
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
  unpaid: 'bg-red-500',
  partial: 'bg-slate-950',
  notDue: 'bg-slate-500',
  pending: 'bg-red-500',
  overdue: 'bg-red-500',
  outstanding: 'bg-red-500',
};

const panelClass = 'bg-white border border-slate-200 rounded-2xl';

export default function AdminDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { profile } = useAuth();
  const { t, fmt, language } = useTheme();
  const profileId = profile?.id ?? '';
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);
  const [pendingRegistrationError, setPendingRegistrationError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(() => dashboardStatsCache.get(profileId) ?? EMPTY_STATS);
  const [loading, setLoading] = useState(() => !dashboardStatsCache.has(profileId));
  const [paymentStatusMonth, setPaymentStatusMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(true);
  const [paymentStatusError, setPaymentStatusError] = useState<string | null>(null);
  const [paymentStatusRefresh, setPaymentStatusRefresh] = useState(0);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const paymentStatusMonthDate = new Date(
    Number(paymentStatusMonth.slice(0, 4)),
    Number(paymentStatusMonth.slice(5, 7)) - 1,
    1,
  );
  const paymentStatusYear = paymentStatusMonthDate.getFullYear();
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' })
      .format(new Date(paymentStatusYear, month, 1))
      .replace('.', ''),
  );
  const paymentStatusMonthLabel = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(paymentStatusMonthDate);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!monthPickerRef.current?.contains(event.target as Node)) setMonthPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMonthPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [monthPickerOpen]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    let refreshTimer: number | undefined;
    let requestId = 0;

    setStats(dashboardStatsCache.get(profileId) ?? EMPTY_STATS);
    setLoading(!dashboardStatsCache.has(profileId));

    async function load() {
      const currentRequestId = ++requestId;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const [houses, activeTenantCount, family, recentPayments, visitors, maintenance, maintenanceCount, visitorsTodayCount] = await Promise.all([
        supabase.from('houses').select('id, status, monthly_rent'),
        supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('tenant_family').select('id', { count: 'exact', head: true }),
        supabase.from('payments').select('id, status, amount_paid, tenants(full_name), houses(house_number), receipt_number').order('created_at', { ascending: false }).limit(5),
        supabase.from('visitors').select('id, visitor_name, purpose, time_in, status, houses(house_number)').order('time_in', { ascending: false }).limit(5),
        supabase.from('maintenance_requests').select('id, title, priority, status, tenants(full_name), houses(house_number), created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('maintenance_requests').select('id', { count: 'exact', head: true }).neq('status', 'completed').neq('status', 'rejected'),
        supabase.from('visitors').select('id', { count: 'exact', head: true }).gte('time_in', todayStart.toISOString()),
      ]);

      if (cancelled || currentRequestId !== requestId) return;
      const summaryErrors = [
        houses.error, activeTenantCount.error, family.error, recentPayments.error, visitors.error,
        maintenance.error, maintenanceCount.error, visitorsTodayCount.error,
      ].filter((error): error is NonNullable<typeof error> => error !== null);
      if (summaryErrors.length) {
        console.error('Unable to load all admin dashboard summary data:', summaryErrors.map(error => error.message).join('; '));
      }
      const houseData = houses.data ?? [];
      const occupied = houseData.filter(h => h.status === 'occupied').length;
      const vacant = houseData.filter(h => h.status === 'vacant').length;
      const monthlyExpectedRent = houseData
        .filter(h => h.status === 'occupied')
        .reduce((sum, house) => sum + Number(house.monthly_rent), 0);
      setStats(previous => {
        const next = {
          ...previous,
          totalHouses: houseData.length,
          occupiedHouses: occupied,
          vacantHouses: vacant,
          maintenanceHouses: maintenanceCount.count ?? 0,
          totalTenants: activeTenantCount.count ?? 0,
          totalFamilyMembers: family.count ?? 0,
          monthlyExpectedRent,
          visitorsToday: visitorsTodayCount.count ?? 0,
          recentPayments: recentPayments.data ?? [],
          recentVisitors: visitors.data ?? [],
          recentMaintenance: maintenance.data ?? [],
        };
        dashboardStatsCache.set(profileId, next);
        return next;
      });
      setLoading(false);

      const [tenants, payments, invoiceBalances, utilityPayments, activeLeases] = await Promise.all([
        supabase.from('tenants').select('id, house_id, move_in_date, move_out_date').eq('status', 'active'),
        supabase.from('payments').select('id, amount_paid, rent_paid_amount, amount_due, status, rent_month, tenants(full_name), houses(house_number), payment_date, receipt_number').order('created_at', { ascending: false }).limit(50),
        supabase.from('utility_invoices').select('id, tenant_id, rent_month, rent_balance, water_amount, electricity_amount').or('rent_balance.gt.0,water_amount.gt.0,electricity_amount.gt.0'),
        supabase.from('payments').select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount'),
        supabase.from('rental_agreements').select('tenant_id, lease_start_date, lease_end_date').eq('status', 'active'),
      ]);

      if (cancelled || currentRequestId !== requestId) return;
      if (invoiceBalances.error || utilityPayments.error) {
        console.error('Unable to load outstanding invoice balance:', invoiceBalances.error?.message ?? utilityPayments.error?.message);
      }
      if (activeLeases.error || tenants.error) {
        console.error('Unable to load active tenant leases for invoice reminders:', activeLeases.error?.message ?? tenants.error?.message);
      }
      if (payments.error) {
        console.error('Unable to load dashboard payment analytics:', payments.error.message);
      }
      const tenantData = tenants.data ?? [];
      const paymentData = payments.data ?? [];

      // Current month in YYYY-MM format
      const currentMonth = new Date().toISOString().slice(0, 7);

      // Only count payments for the current month for expected/collected
      const thisMonthPayments = paymentData.filter(p =>
        p.rent_month && p.rent_month.slice(0, 7) === currentMonth
      );

      const collected = thisMonthPayments.reduce((s, p) => s + Number(p.amount_paid), 0);
      const invoiceChargeBalances = invoiceBalances.error || utilityPayments.error
        ? new Map()
        : calculateInvoiceChargeBalances(invoiceBalances.data ?? [], utilityPayments.data ?? []);
      const outstanding = [...invoiceChargeBalances.values()]
        .reduce((total, balance) => total + balance.total_balance_due, 0);
      const unpaidInvoiceCount = [...invoiceChargeBalances.values()]
        .filter(balance => balance.total_balance_due > 0)
        .length;
      const invoicesToCreate = activeLeases.error
        ? 0
        : getTenantsDueForInvoice(
            tenantData,
            invoiceBalances.data ?? [],
            activeLeases.data ?? [],
            new Date(),
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

      setStats(previous => {
        const next = {
          ...previous,
          monthlyCollected: collected,
          outstandingRent: outstanding,
          invoicesToCreate,
          unpaidInvoices: unpaidInvoiceCount,
          recentPayments: paymentData.slice(0, 5),
          monthlyIncome,
        };
        dashboardStatsCache.set(profileId, next);
        return next;
      });
    }
    void load();
    const scheduleLoad = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void load();
        setPaymentStatusRefresh(version => version + 1);
      }, 250);
    };
    const channel = supabase
      .channel('admin-dashboard-invoice-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utility_invoices' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleLoad)
      .subscribe();
    return () => {
      cancelled = true;
      requestId += 1;
      window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [language, profileId]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    const [year, month] = paymentStatusMonth.split('-').map(Number);
    const startDate = `${paymentStatusMonth}-01`;
    const nextMonthDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    setPaymentStatusLoading(true);
    setPaymentStatusError(null);
    setStats(previous => ({ ...previous, paymentStatusCounts: [] }));

    async function loadPaymentStatus() {
      const [payments, invoices, utilityPayments, activeTenants, activeLeases] = await Promise.all([
        supabase.from('payments')
          .select('id, tenant_id, rent_month, due_date, status')
          .gte('rent_month', startDate)
          .lt('rent_month', nextMonthDate),
        supabase.from('utility_invoices')
          .select('id, tenant_id, rent_month, due_date, rent_balance, water_amount, electricity_amount')
          .gte('rent_month', startDate)
          .lt('rent_month', nextMonthDate),
        supabase.from('payments')
          .select('tenant_id, rent_month, water_paid_amount, electricity_paid_amount')
          .gte('rent_month', startDate)
          .lt('rent_month', nextMonthDate),
        supabase.from('tenants')
          .select('id, house_id, move_in_date, move_out_date')
          .eq('status', 'active'),
        supabase.from('rental_agreements')
          .select('tenant_id, lease_start_date, lease_end_date')
          .eq('status', 'active'),
      ]);

      if (cancelled) return;
      const failedResult = [payments, invoices, utilityPayments, activeTenants, activeLeases].find(result => result.error);
      if (failedResult?.error) {
        console.error('Unable to load monthly payment status counts:', failedResult.error.message);
        setPaymentStatusError(failedResult.error.message);
        setPaymentStatusLoading(false);
        return;
      }

      const outstandingByInvoice = calculateInvoiceChargeBalances(invoices.data ?? [], utilityPayments.data ?? []);
      const localToday = new Date();
      const todayDate = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
      const periodKey = (tenantId: string, rentMonth: string) => `${tenantId}:${rentMonth.slice(0, 7)}`;
      const partialBillingPeriods = new Set(
        (payments.data ?? [])
          .filter(payment => payment.status === 'partial')
          .map(payment => periodKey(payment.tenant_id, payment.rent_month)),
      );
      const notDueBillingPeriods = new Set(
        (invoices.data ?? [])
          .filter(invoice => (outstandingByInvoice.get(invoice.id)?.total_balance_due ?? 0) > 0
            && invoice.due_date > todayDate
            && !partialBillingPeriods.has(periodKey(invoice.tenant_id, invoice.rent_month)))
          .map(invoice => periodKey(invoice.tenant_id, invoice.rent_month)),
      );
      const recordedBillingPeriods = [
        ...(invoices.data ?? []),
        ...(payments.data ?? []).filter(payment => payment.rent_month),
      ];
      getTenantsNotDueForInvoice(
        activeTenants.data ?? [],
        recordedBillingPeriods,
        activeLeases.data ?? [],
        localToday,
        paymentStatusMonth,
      ).forEach(({ tenant }) => {
        notDueBillingPeriods.add(periodKey(tenant.id, startDate));
      });
      (payments.data ?? [])
        .filter(payment => payment.status === 'pending' && payment.due_date > todayDate)
        .forEach(payment => {
          const key = periodKey(payment.tenant_id, payment.rent_month);
          if (!partialBillingPeriods.has(key)) notDueBillingPeriods.add(key);
        });
      const unpaidBillingPeriods = new Set(
        (invoices.data ?? [])
          .filter(invoice => (outstandingByInvoice.get(invoice.id)?.total_balance_due ?? 0) > 0)
          .map(invoice => periodKey(invoice.tenant_id, invoice.rent_month)),
      );
      (payments.data ?? [])
        .filter(payment => payment.status === 'pending' || payment.status === 'overdue')
        .forEach(payment => unpaidBillingPeriods.add(periodKey(payment.tenant_id, payment.rent_month)));
      notDueBillingPeriods.forEach(key => unpaidBillingPeriods.delete(key));

      const paymentStatusCounts = [
        { status: 'paid', count: (payments.data ?? []).filter(payment => payment.status === 'paid').length },
        { status: 'unpaid', count: unpaidBillingPeriods.size },
        { status: 'partial', count: (payments.data ?? []).filter(payment => payment.status === 'partial').length },
        { status: 'notDue', count: notDueBillingPeriods.size },
      ];
      setStats(previous => {
        const next = { ...previous, paymentStatusCounts };
        dashboardStatsCache.set(profileId, next);
        return next;
      });
      setPaymentStatusLoading(false);
    }

    void loadPaymentStatus().catch(error => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Unable to load monthly payment status counts:', message);
      setPaymentStatusError(message);
      setPaymentStatusLoading(false);
    });

    return () => { cancelled = true; };
  }, [paymentStatusMonth, paymentStatusRefresh, profileId]);

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPendingRegistrations]);

  const overviewItems: AdminOverviewItem[] = [
    { label: language === 'fr' ? 'Maisons' : 'Houses', value: String(stats.totalHouses), page: 'houses', color: '#2563eb' },
    { label: language === 'fr' ? 'Locataires' : 'Tenants', value: String(stats.totalTenants), page: 'tenants', color: '#7c3aed' },
    { label: language === 'fr' ? 'Paiements' : 'Payments', value: String(stats.paymentStatusCounts.reduce((sum, item) => sum + item.count, 0)), page: 'payments', color: '#059669' },
    { label: language === 'fr' ? 'Entretien' : 'Maint.', value: String(stats.maintenanceHouses), page: 'maintenance', color: '#dc2626' },
    { label: language === 'fr' ? 'Factures' : 'Invoices', value: String(stats.invoicesToCreate), page: 'invoices', color: '#4f46e5' },
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
      <DashboardWelcomeHero title={t('dashboard')} />

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
          className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-red-300 bg-white p-3 text-left shadow-sm transition-colors hover:bg-red-50 sm:flex sm:gap-4 sm:p-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center text-red-600 sm:h-11 sm:w-11">
            <AlertCircle className="h-7 w-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-tight text-red-800 sm:text-lg">
              {stats.unpaidInvoices} {language === 'fr' ? 'factures impayées' : 'unpaid invoices'}
            </span>
            <span className="mt-1 block text-xs leading-snug text-red-700 sm:text-sm">
              {language === 'fr' ? 'Consultez les factures à régulariser.' : 'Review invoices that need attention.'}
            </span>
          </span>
          <span className="col-start-2 inline-flex w-fit items-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm sm:ml-auto">
            {language === 'fr' ? 'Voir les factures' : 'View invoices'}
          </span>
        </button>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard icon={Building2} title={t('houses')} label={t('totalHouses')} value={stats.totalHouses} iconStyle="bg-blue-50 text-blue-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={CheckCircle2} title={t('houses')} label={t('occupied')} value={stats.occupiedHouses} iconStyle="bg-emerald-50 text-emerald-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={Home} title={t('houses')} label={t('vacant')} value={stats.vacantHouses} iconStyle="bg-amber-50 text-amber-700" onClick={() => onNavigate('houses')} />
        <StatCard icon={Wrench} title={t('maintenance')} label={t('maintenanceHouses')} value={stats.maintenanceHouses} iconStyle="bg-red-50 text-red-700" iconOnly onClick={() => onNavigate('maintenance')} />
        <StatCard icon={Users} title={t('tenants')} label={t('activeTenants')} value={stats.totalTenants} sub={`${stats.totalFamilyMembers} ${t('familyMembers')}`} iconStyle="bg-violet-50 text-violet-700" onClick={() => onNavigate('tenants')} />
        <StatCard icon={Wallet} title={t('payments')} label={t('expectedRent')} value={fmt(stats.monthlyExpectedRent)} moneyAmount={stats.monthlyExpectedRent} amountTone="expected" iconStyle="bg-sky-50 text-sky-700" onClick={() => onNavigate('payments')} />
        <StatCard icon={TrendingUp} title={t('payments')} label={t('collected')} value={fmt(stats.monthlyCollected)} moneyAmount={stats.monthlyCollected} amountTone="collected" iconStyle="bg-green-50 text-green-700" onClick={() => onNavigate('payments')} />
        <StatCard icon={AlertCircle} title={t('payments')} label={t('outstanding')} value={fmt(stats.outstandingRent)} moneyAmount={stats.outstandingRent} amountTone="outstanding" iconStyle="bg-red-50 text-red-700" onClick={() => onNavigate('invoices')} />
        <StatCard
          icon={StickyNote}
          title={t('invoices')}
          label={t('invoices')}
          value={stats.invoicesToCreate}
          sub={`${stats.unpaidInvoices} ${t('unpaid')}`}
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

        <div className="payment-status-glass relative rounded-2xl border p-3 sm:p-5">
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('paymentStatus')}</h3>
              <div className="payment-status-month-picker relative shrink-0" ref={monthPickerRef}>
                <button
                  type="button"
                  aria-label={t('filterByMonth')}
                  aria-haspopup="dialog"
                  aria-expanded={monthPickerOpen}
                  onClick={() => setMonthPickerOpen(open => !open)}
                  className="payment-status-month-trigger inline-flex max-w-[158px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                >
                  <span className="truncate">{paymentStatusMonthLabel}</span>
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
                {monthPickerOpen && (
                  <div
                    className="payment-status-month-popover absolute right-0 top-full z-30 mt-2 w-[240px] rounded-xl border p-3 shadow-xl"
                    role="dialog"
                    aria-label={t('filterByMonth')}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <button
                        type="button"
                        aria-label={language === 'fr' ? 'Année précédente' : 'Previous year'}
                        onClick={() => setPaymentStatusMonth(`${paymentStatusYear - 1}-${paymentStatusMonth.slice(5, 7)}`)}
                        className="payment-status-month-nav rounded-lg p-1.5"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm font-semibold tabular-nums">{paymentStatusYear}</span>
                      <button
                        type="button"
                        aria-label={language === 'fr' ? 'Année suivante' : 'Next year'}
                        onClick={() => setPaymentStatusMonth(`${paymentStatusYear + 1}-${paymentStatusMonth.slice(5, 7)}`)}
                        className="payment-status-month-nav rounded-lg p-1.5"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {monthNames.map((name, month) => {
                        const value = `${paymentStatusYear}-${String(month + 1).padStart(2, '0')}`;
                        const isSelected = value === paymentStatusMonth;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setPaymentStatusMonth(value);
                              setMonthPickerOpen(false);
                            }}
                            className={`payment-status-month-option rounded-lg px-2 py-2 text-xs font-medium capitalize ${isSelected ? 'is-selected' : ''}`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 border-t pt-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setPaymentStatusMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                          setMonthPickerOpen(false);
                        }}
                        className="payment-status-this-month text-xs font-medium"
                      >
                        {t('thisMonth')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-4">{t('currentBreakdown')}</p>
            {paymentStatusError ? (
              <p role="alert" className="text-red-600 text-sm text-center py-4">{t('paymentStatusLoadError')}</p>
            ) : paymentStatusLoading ? (
              <p className="text-slate-400 text-sm text-center py-4">{t('loading')}</p>
            ) : stats.paymentStatusCounts.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">{t('noPaymentsYet')}</p>
            ) : (
              <div className="space-y-3">
                {stats.paymentStatusCounts.map(({ status, count }) => {
                  const total = stats.paymentStatusCounts.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow-sm ${statusColors[status] ?? 'bg-slate-400'}`} />
                          <span className="text-sm capitalize text-slate-700">{status === 'unpaid' ? t('unpaid') : t(status)}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{count}</span>
                      </div>
                      <div className={`payment-status-track payment-status-track-${status} h-1.5 rounded-full overflow-hidden`}>
                        <div className={`payment-status-fill payment-status-fill-${status} h-full rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Recent Payments */}
        <div className={`dashboard-activity-card p-3 sm:p-5 ${panelClass}`}>
          <div className="dashboard-activity-header flex items-center justify-between mb-3 pb-3">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('recentPayments')}</h3>
            <button onClick={() => onNavigate('payments')} className="dashboard-activity-link inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800">
              {t('viewAll')} <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
          <div>
            {stats.recentPayments.length === 0 && <p className="text-slate-400 text-sm">{t('noPaymentsYet')}</p>}
            {stats.recentPayments.map(p => (
              <div key={p.id} className="dashboard-activity-row flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                <div className="dashboard-activity-icon flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 shrink-0">
                  <Wallet className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{(p.tenants as any)?.full_name ?? 'Unknown'}</p>
                  <p className="truncate text-xs text-slate-500">{(p.houses as any)?.house_number} <span className="px-0.5 text-slate-300">·</span> {p.receipt_number}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums text-slate-800">{fmt(Number(p.amount_paid ?? 0))}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                    p.status === 'paid' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                    p.status === 'partial' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                    p.status === 'overdue' ? 'border-red-200 bg-red-50 text-red-700' :
                    'border-amber-200 bg-amber-50 text-amber-700'
                  }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {t(p.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Visitors */}
        <div className={`dashboard-activity-card p-3 sm:p-5 ${panelClass}`}>
          <div className="dashboard-activity-header flex items-center justify-between mb-3 pb-3">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('recentVisitors')}</h3>
            <button onClick={() => onNavigate('visitors')} className="dashboard-activity-link inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800">
              {t('viewAll')} <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
          <div>
            {stats.recentVisitors.length === 0 && <p className="text-slate-400 text-sm">{t('noVisitorsYet')}</p>}
            {stats.recentVisitors.map(v => (
              <div key={v.id} className="dashboard-activity-row flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                <div className="dashboard-activity-icon flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 shrink-0">
                  <UserCheck className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{v.visitor_name}</p>
                  <p className="truncate text-xs text-slate-500">{(v.houses as any)?.house_number} <span className="px-0.5 text-slate-300">·</span> {v.purpose}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  v.status === 'inside' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${v.status === 'inside' ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                  {t(v.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Maintenance */}
        <div className={`dashboard-activity-card p-3 sm:p-5 ${panelClass}`}>
          <div className="dashboard-activity-header flex items-center justify-between mb-3 pb-3">
            <h3 className="text-slate-900 font-semibold text-sm sm:text-base">{t('maintenanceRequests')}</h3>
            <button onClick={() => onNavigate('maintenance')} className="dashboard-activity-link inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800">
              {t('viewAll')} <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
          <div>
            {stats.recentMaintenance.length === 0 && <p className="text-slate-400 text-sm">{t('noRequestsYet')}</p>}
            {stats.recentMaintenance.map(m => (
              <div key={m.id} className="dashboard-activity-row flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                <div className="dashboard-activity-icon flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 shrink-0">
                  <Wrench className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{m.title}</p>
                  <p className="truncate text-xs text-slate-500">{(m.tenants as any)?.full_name} <span className="px-0.5 text-slate-300">·</span> {(m.houses as any)?.house_number}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                  m.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                  m.status === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                  'border-blue-200 bg-blue-50 text-blue-700'
                }`}>{m.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
