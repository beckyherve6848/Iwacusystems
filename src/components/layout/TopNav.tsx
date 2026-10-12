import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Bell, Search, Menu, Globe, DollarSign, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, CURRENCY_SYMBOLS, Currency } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

interface TopNavProps {
  onMenuToggle: () => void;
  onNavigate: (page: string) => void;
  sidebarCollapsed: boolean;
}

const CURRENCIES: Currency[] = ['BIF', 'KSh', 'Frw', 'Ugx', 'Tsh', 'Cdf', 'USD', 'EUR'];

interface SearchResult {
  id: string;
  title: string;
  detail: string;
  page: string;
  category: string;
}

interface SearchSpec {
  table: string;
  titleField: keyof SearchRecord;
  detailField: keyof SearchRecord;
  page: string;
  categoryKey: string;
}

interface SearchRecord {
  id: string;
  invoice_number?: string | null;
  receipt_number?: string | null;
  status?: string | null;
  title?: string | null;
  full_name?: string | null;
  tenant_code?: string | null;
  house_number?: string | null;
  visitor_name?: string | null;
  phone?: string | null;
  national_id?: string | null;
  vehicle_registration?: string | null;
}

const SEARCH_PAGES: Record<string, Array<{ page: string; labelKey: string }>> = {
  admin: [
    { page: 'dashboard', labelKey: 'dashboard' },
    { page: 'houses', labelKey: 'houses' },
    { page: 'tenants', labelKey: 'tenants' },
    { page: 'caretakers', labelKey: 'caretakers' },
    { page: 'property-managers', labelKey: 'propertyManagers' },
    { page: 'invoices', labelKey: 'invoices' },
    { page: 'payments', labelKey: 'payments' },
    { page: 'agreements', labelKey: 'agreements' },
    { page: 'maintenance', labelKey: 'maintenance' },
    { page: 'visitors', labelKey: 'visitors' },
    { page: 'reports', labelKey: 'reports' },
    { page: 'user-activity', labelKey: 'userActivity' },
    { page: 'notifications', labelKey: 'notifications' },
    { page: 'settings', labelKey: 'settings' },
  ],
  property_manager: [
    { page: 'manager-dashboard', labelKey: 'dashboard' },
    { page: 'houses', labelKey: 'houses' },
    { page: 'tenants', labelKey: 'tenants' },
    { page: 'invoices', labelKey: 'invoices' },
    { page: 'payments', labelKey: 'payments' },
    { page: 'maintenance', labelKey: 'maintenance' },
    { page: 'visitors', labelKey: 'visitors' },
    { page: 'reports', labelKey: 'reports' },
    { page: 'notifications', labelKey: 'notifications' },
  ],
  caretaker: [
    { page: 'caretaker-dashboard', labelKey: 'dashboard' },
    { page: 'invoices', labelKey: 'invoices' },
    { page: 'caretaker-visitors', labelKey: 'visitors' },
    { page: 'caretaker-register-visitor', labelKey: 'caretaker-register-visitor' },
    { page: 'notifications', labelKey: 'notifications' },
    { page: 'caretaker-profile', labelKey: 'caretaker-profile' },
  ],
  tenant: [
    { page: 'tenant-dashboard', labelKey: 'tenant-dashboard' },
    { page: 'tenant-invoices', labelKey: 'tenant-invoices' },
    { page: 'tenant-payments', labelKey: 'tenant-payments' },
    { page: 'tenant-maintenance', labelKey: 'tenant-maintenance' },
    { page: 'tenant-agreement', labelKey: 'tenant-agreement' },
    { page: 'tenant-chat', labelKey: 'tenant-chat' },
    { page: 'notifications', labelKey: 'notifications' },
  ],
  gatekeeper: [
    { page: 'gk-dashboard', labelKey: 'gk-dashboard' },
    { page: 'visitors', labelKey: 'visitors' },
  ],
};

export default function TopNav({ onMenuToggle, onNavigate, sidebarCollapsed }: TopNavProps) {
  const { profile } = useAuth();
  const {
    language, setLanguage, t, currency, setCurrency,
    currencyRatesAvailable, currencyRatesLoading, currencyRatesError, refreshCurrencyRates,
  } = useTheme();
  const roleLabel = profile?.role === 'admin'
    ? t('administrator')
    : profile?.role === 'gatekeeper'
      ? t('gatekeeper')
      : profile?.role === 'caretaker'
        ? t('caretaker')
        : profile?.role === 'property_manager'
          ? t('propertyManager')
        : t('tenant');
  const [unreadCount, setUnreadCount] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    const load = () =>
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false)
        .then(({ count }) => setUnreadCount(count ?? 0));
    load();
    const channel = supabase
      .channel('topnav-notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (!profile || term.length < 1) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      const role = profile.role;
      const pages = (SEARCH_PAGES[role] ?? []).filter(item =>
        t(item.labelKey).toLowerCase().includes(term.toLowerCase()),
      ).map(item => ({
        id: `page-${item.page}`,
        title: t(item.labelKey),
        detail: t('searchOpenPage'),
        page: item.page,
        category: t('searchPageCategory'),
      }));

      const specs: SearchSpec[] = role === 'tenant'
        ? [
            { table: 'utility_invoices', titleField: 'invoice_number', detailField: 'status', page: 'tenant-invoices', categoryKey: 'searchInvoiceCategory' },
            { table: 'payments', titleField: 'receipt_number', detailField: 'status', page: 'tenant-payments', categoryKey: 'searchReceiptCategory' },
            { table: 'maintenance_requests', titleField: 'title', detailField: 'status', page: 'tenant-maintenance', categoryKey: 'maintenance' },
          ]
        : role === 'caretaker'
          ? [
              { table: 'utility_invoices', titleField: 'invoice_number', detailField: 'status', page: 'invoices', categoryKey: 'searchInvoiceCategory' },
              { table: 'visitors', titleField: 'visitor_name', detailField: 'status', page: 'caretaker-visitors', categoryKey: 'visitors' },
            ]
          : role === 'gatekeeper'
            ? [
                { table: 'visitors', titleField: 'visitor_name', detailField: 'status', page: 'visitors', categoryKey: 'visitors' },
              ]
            : [
                { table: 'utility_invoices', titleField: 'invoice_number', detailField: 'status', page: 'invoices', categoryKey: 'searchInvoiceCategory' },
                { table: 'payments', titleField: 'receipt_number', detailField: 'status', page: 'payments', categoryKey: 'searchReceiptCategory' },
                { table: 'maintenance_requests', titleField: 'title', detailField: 'status', page: 'maintenance', categoryKey: 'maintenance' },
                { table: 'tenants', titleField: 'full_name', detailField: 'tenant_code', page: 'tenants', categoryKey: 'tenants' },
                { table: 'houses', titleField: 'house_number', detailField: 'status', page: 'houses', categoryKey: 'houses' },
                { table: 'visitors', titleField: 'visitor_name', detailField: 'status', page: 'visitors', categoryKey: 'visitors' },
              ];

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(term);
      const safeTerm = term.replace(/[\\%_]/g, '\\$&');
      const searched = await Promise.all(specs.map(async spec => {
        let data: SearchRecord[] | null = null;
        let failed = false;
        const pattern = `%${safeTerm}%`;

        if (spec.table === 'utility_invoices') {
          const query = supabase.from('utility_invoices').select('id, invoice_number, status').limit(5);
          const response = isUuid
            ? await query.eq('id', term)
            : await query.ilike('invoice_number', pattern);
          data = response.data;
          failed = Boolean(response.error);
        } else if (spec.table === 'payments') {
          const query = supabase.from('payments').select('id, receipt_number, status').limit(5);
          const response = isUuid
            ? await query.eq('id', term)
            : await query.ilike('receipt_number', pattern);
          data = response.data;
          failed = Boolean(response.error);
        } else if (spec.table === 'maintenance_requests') {
          const query = supabase.from('maintenance_requests').select('id, title, status').limit(5);
          const response = isUuid
            ? await query.eq('id', term)
            : await query.ilike('title', pattern);
          data = response.data;
          failed = Boolean(response.error);
        } else if (spec.table === 'tenants') {
          const query = supabase.from('tenants').select('id, full_name, tenant_code').limit(5);
          if (isUuid) {
            const response = await query.eq('id', term);
            data = response.data;
            failed = Boolean(response.error);
          } else {
            const [names, codes] = await Promise.all([
              supabase.from('tenants').select('id, full_name, tenant_code').ilike('full_name', pattern).limit(5),
              supabase.from('tenants').select('id, full_name, tenant_code').ilike('tenant_code', pattern).limit(5),
            ]);
            data = [...(names.data ?? []), ...(codes.data ?? [])].filter(
              (record, index, all) => all.findIndex(item => item.id === record.id) === index,
            );
            failed = Boolean(names.error || codes.error);
          }
        } else if (spec.table === 'houses') {
          const query = supabase.from('houses').select('id, house_number, status').limit(5);
          const response = isUuid
            ? await query.eq('id', term)
            : await query.ilike('house_number', pattern);
          data = response.data;
          failed = Boolean(response.error);
        } else if (spec.table === 'visitors') {
          if (isUuid) {
            const { data: visitorData, error } = await supabase
              .from('visitors')
              .select('id, visitor_name, phone, national_id, vehicle_registration, status')
              .eq('id', term)
              .limit(5);
            data = visitorData;
            failed = Boolean(error);
          } else {
            const columns = ['visitor_name', 'phone', 'national_id', 'vehicle_registration'] as const;
            const visitorSearches = await Promise.all(columns.map(column =>
              supabase
                .from('visitors')
                .select('id, visitor_name, phone, national_id, vehicle_registration, status')
                .ilike(column, pattern)
                .limit(5),
            ));
            data = visitorSearches.flatMap(result => result.data ?? []).filter(
              (record, index, all) => all.findIndex(item => item.id === record.id) === index,
            );
            failed = visitorSearches.some(result => Boolean(result.error));
          }
        }

        const results = (data ?? []).map(record => ({
          id: `${spec.table}-${record.id}`,
          title: String(record[spec.titleField] ?? t(spec.categoryKey)),
          detail: t(String(record[spec.detailField] ?? record.id)),
          page: spec.page,
          category: t(spec.categoryKey),
        }));
        return { results, failed };
      }));

      if (cancelled) return;
      const records = searched.flatMap(result => result.results);
      const uniqueResults = [...pages, ...records.filter(
        (result, index, all) => all.findIndex(item => item.id === result.id) === index,
      )].slice(0, 8);
      setSearchResults(uniqueResults);
      setSearchError(searched.some(result => result.failed));
      setActiveResult(0);
      setSearching(false);
      setSearchOpen(true);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profile, searchTerm, language, t]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const closePanels = () => { setLangOpen(false); setCurrencyOpen(false); setSearchOpen(false); };
  const selectSearchResult = (result: SearchResult) => {
    onNavigate(result.page);
    setSearchOpen(false);
    setSearchTerm('');
  };

  return (
    <header
      className={`fixed top-0 right-0 z-10 h-[72px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'left-0 lg:left-[72px]' : 'left-0 lg:left-[260px]'
      }`}
      style={{
        background: 'rgba(226,232,240,0.78)',
        backdropFilter: 'blur(22px) saturate(160%)',
        WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        borderBottom: '1px solid rgba(148,163,184,0.38)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.65)',
        color: '#111827',
      }}
    >
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-slate-500 hover:text-slate-900 p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search */}
      <div className="flex-1 min-w-0 max-w-sm" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            placeholder={t('searchPlaceholder')}
            role="combobox"
            aria-expanded={searchOpen && searchTerm.trim().length > 0}
            aria-controls="topnav-search-results"
            aria-autocomplete="list"
            onFocus={event => {
              event.currentTarget.style.borderColor = '#111827';
              if (searchTerm.trim()) setSearchOpen(true);
            }}
            onChange={event => {
              setSearchTerm(event.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') setSearchOpen(false);
              if (event.key === 'ArrowDown' && searchResults.length) {
                event.preventDefault();
                setActiveResult(index => (index + 1) % searchResults.length);
              }
              if (event.key === 'ArrowUp' && searchResults.length) {
                event.preventDefault();
                setActiveResult(index => (index - 1 + searchResults.length) % searchResults.length);
              }
              if (event.key === 'Enter' && searchResults[activeResult]) {
                event.preventDefault();
                selectSearchResult(searchResults[activeResult]);
              }
            }}
            className="w-full text-xs sm:text-sm text-slate-900 placeholder-slate-400 rounded-xl py-2.5 pl-10 pr-9 focus:outline-none transition-all"
            style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}
            onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSearchResults([]); setSearchOpen(false); }}
              aria-label={t('searchClear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {searchOpen && searchTerm.trim() && (
            <div
              id="topnav-search-results"
              role="listbox"
              className="absolute left-0 top-full z-50 mt-2 w-[min(90vw,24rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              {searching ? (
                <p className="px-4 py-3 text-sm text-slate-500" role="status">{t('searchLoading')}</p>
              ) : searchResults.length ? (
                <>
                  {searchError && (
                    <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800" role="status">
                      {t('searchPartialError')}
                    </p>
                  )}
                  {searchResults.map((result, index) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeResult}
                      onMouseEnter={() => setActiveResult(index)}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectSearchResult(result)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        index === activeResult ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{result.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {result.category} · {result.detail}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </>
              ) : searchError ? (
                <p className="px-4 py-3 text-sm text-red-700" role="alert">{t('searchError')}</p>
              ) : (
                <p className="px-4 py-3 text-sm text-slate-500">{t('searchNoResults')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        {/* Currency picker */}
        {profile?.role !== 'caretaker' && (
          <div className="relative">
            <button
              onClick={() => { setCurrencyOpen(o => !o); setLangOpen(false); }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all text-xs font-bold tracking-widest"
              style={{ border: '1px solid #e5e7eb' }}
              title={t('currency')}
            >
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>{CURRENCY_SYMBOLS[currency]}</span>
            </button>
            {currencyOpen && (
              <div
                className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50 min-w-[110px] animate-fade-up"
                style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}
              >
                {!currencyRatesAvailable && (
                  <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100" role={currencyRatesError ? 'alert' : 'status'}>
                    <p>{currencyRatesLoading ? t('currencyRatesLoading') : t('currencyRatesUnavailable')}</p>
                    {currencyRatesError && (
                      <button
                        onClick={refreshCurrencyRates}
                        className="mt-1 font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        {t('retryCurrencyRates')}
                      </button>
                    )}
                  </div>
                )}
                {CURRENCIES.map(c => (
                  <button
                    key={c}
                    onClick={() => { setCurrency(c); closePanels(); }}
                    disabled={c !== 'BIF' && !currencyRatesAvailable}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      currency === c ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                    style={currency === c ? { background: 'rgba(16,185,129,0.08)' } : {}}
                  >
                    <span className="font-mono text-xs w-8">{CURRENCY_SYMBOLS[c]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Language toggle */}
        <div className="relative">
          <button
            onClick={() => { setLangOpen(o => !o); setCurrencyOpen(false); }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all text-xs font-bold tracking-widest"
            style={{ border: '1px solid #e5e7eb' }}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="uppercase">{language}</span>
          </button>
          {langOpen && (
            <div
              className="absolute right-0 top-full mt-2 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[130px] animate-fade-up"
              style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}
            >
              {(['en', 'fr'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); closePanels(); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors ${
                    language === lang ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                  style={language === lang ? { background: 'rgba(16,185,129,0.08)' } : {}}
                >
                  <span>{lang === 'en' ? '🇬🇧' : '🇫🇷'}</span>
                  {lang === 'en' ? 'English' : 'Français'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications bell */}
        <button
          onClick={() => { onNavigate('notifications'); closePanels(); }}
          className="relative p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-6 mx-1 hidden sm:block" style={{ background: '#e5e7eb' }} />

        {/* Avatar */}
        <div className="flex items-center gap-2 sm:gap-2.5 pl-1 sm:pl-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
            style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1.5px solid rgba(255,255,255,0.15)' }}
          >
            {profile?.photo_url
              ? <img src={profile.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <span className="text-sm font-bold text-white">
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </span>
            }
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-slate-900 leading-tight">{profile?.full_name}</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
