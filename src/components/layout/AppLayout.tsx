import React, { useEffect, useState } from 'react';
import { BatteryFull, SignalHigh, Wifi } from 'lucide-react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import ActivityTrackingNotice from './ActivityTrackingNotice';
import {
  getPhoneStatusStyle,
  getPhoneThemeMode,
  PHONE_THEME_MODE_EVENT,
  PHONE_STATUS_STYLE_EVENT,
  PhoneThemeMode,
  PhoneStatusStyle,
} from '@/lib/phoneStatusStyle';

interface AppLayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

function formatStatusTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

export default function AppLayout({ currentPage, onNavigate, children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusTime, setStatusTime] = useState(() => formatStatusTime());
  const [phoneStatusStyle, setPhoneStatusStyle] = useState<PhoneStatusStyle>(() => getPhoneStatusStyle());
  const [phoneThemeMode, setPhoneThemeMode] = useState<PhoneThemeMode>(() => getPhoneThemeMode());
  const isChatPage = ['admin-chat', 'manager-chat', 'caretaker-chat', 'tenant-chat'].includes(currentPage);

  useEffect(() => {
    const timer = window.setInterval(() => setStatusTime(formatStatusTime()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const openSidebar = () => setSidebarCollapsed(false);
    window.addEventListener('app:open-sidebar', openSidebar);
    return () => window.removeEventListener('app:open-sidebar', openSidebar);
  }, []);

  useEffect(() => {
    const updatePhoneStatusStyle = (event: Event) => {
      setPhoneStatusStyle((event as CustomEvent<PhoneStatusStyle>).detail);
    };
    window.addEventListener(PHONE_STATUS_STYLE_EVENT, updatePhoneStatusStyle);
    return () => window.removeEventListener(PHONE_STATUS_STYLE_EVENT, updatePhoneStatusStyle);
  }, []);

  useEffect(() => {
    const updatePhoneThemeMode = (event: Event) => {
      setPhoneThemeMode((event as CustomEvent<PhoneThemeMode>).detail);
    };
    window.addEventListener(PHONE_THEME_MODE_EVENT, updatePhoneThemeMode);
    return () => window.removeEventListener(PHONE_THEME_MODE_EVENT, updatePhoneThemeMode);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('phone-dark', phoneThemeMode === 'dark');
    return () => document.documentElement.classList.remove('phone-dark');
  }, [phoneThemeMode]);

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia('(min-width: 1024px)');
    const keepDesktopSidebarExpanded = () => {
      if (desktopBreakpoint.matches) setSidebarCollapsed(false);
    };
    keepDesktopSidebarExpanded();
    desktopBreakpoint.addEventListener('change', keepDesktopSidebarExpanded);
    return () => desktopBreakpoint.removeEventListener('change', keepDesktopSidebarExpanded);
  }, []);

  return (
    <div className="app-shell min-h-screen text-slate-900" data-current-page={currentPage} style={{ background: '#f7f8fa' }}>
      <div
        aria-hidden="true"
        className="phone-status-bar fixed inset-x-0 top-0 z-40 flex h-10 items-center justify-between px-6 text-[13px] font-semibold text-slate-900 md:hidden"
        style={{
          background: 'rgba(226,232,240,0.78)',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        }}
      >
        <span className="min-w-10 tabular-nums">{statusTime}</span>
        {phoneStatusStyle === 'dynamic-island' ? (
          <div className="absolute left-1/2 top-1.5 flex h-7 w-[108px] -translate-x-1/2 items-center justify-end rounded-full bg-[#050505] px-3 shadow-[0_1px_5px_rgba(255,255,255,0.08)]">
            <span className="h-2 w-2 rounded-full border border-[#15202a] bg-[#16232d] shadow-[inset_0_0_3px_rgba(96,165,250,0.5)]" />
          </div>
        ) : (
          <div className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full border border-[#202124] bg-[#050505] p-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
            <span className="block h-3.5 w-3.5 rounded-full bg-[#10151c] shadow-[inset_0_0_2px_rgba(96,165,250,0.25)]" />
          </div>
        )}
        <div className="phone-status-indicators flex min-w-14 items-center justify-end gap-1.5">
          <SignalHigh className="phone-status-indicator h-[15px] w-[15px]" strokeWidth={2} />
          <Wifi className="phone-status-indicator h-[15px] w-[15px]" strokeWidth={2} />
          <BatteryFull className="phone-status-indicator h-[15px] w-[15px]" strokeWidth={2} />
        </div>
      </div>
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />
      <TopNav
        onMenuToggle={() => setSidebarCollapsed(c => !c)}
        onNavigate={onNavigate}
      />
      <main
        className="min-h-screen pt-[112px] transition-all duration-300 md:pt-[72px] lg:pl-[260px]"
      >
        <div className={`mx-auto max-w-[1600px] ${isChatPage ? 'p-3 sm:p-4 lg:p-5' : 'p-4 sm:p-6 lg:p-8'}`}>
          <ActivityTrackingNotice />
          {children}
        </div>
      </main>
    </div>
  );
}
