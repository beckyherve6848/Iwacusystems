import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import ActivityTrackingNotice from './ActivityTrackingNotice';
import {
  getDesktopThemeMode,
  getPhoneThemeMode,
  PHONE_THEME_MODE_EVENT,
  PhoneThemeMode,
} from '@/lib/phoneThemeMode';
import { useTheme } from '@/contexts/ThemeContext';
import { setApiNetworkAvailable } from '@/lib/offlineNetwork';

interface AppLayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onPrefetch?: (page: string) => void;
  children: React.ReactNode;
}

export default function AppLayout({ currentPage, onNavigate, onPrefetch, children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [phoneThemeMode, setPhoneThemeMode] = useState<PhoneThemeMode>(() => getPhoneThemeMode());
  const [desktopThemeMode, setDesktopThemeMode] = useState<PhoneThemeMode>(() => getDesktopThemeMode());
  const [isPhoneViewport, setIsPhoneViewport] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { language } = useTheme();
  const isChatPage = ['admin-chat', 'manager-chat', 'caretaker-chat', 'tenant-chat'].includes(currentPage);

  useEffect(() => {
    const openSidebar = () => setSidebarCollapsed(false);
    window.addEventListener('app:open-sidebar', openSidebar);
    return () => window.removeEventListener('app:open-sidebar', openSidebar);
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setApiNetworkAvailable(navigator.onLine);
      setIsOnline(navigator.onLine);
    };
    const updateServiceWorkerStatus = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === 'OFFLINE_NETWORK_UNAVAILABLE') {
        setApiNetworkAvailable(false);
        setIsOnline(false);
      }
      if (event.data.type === 'OFFLINE_NETWORK_AVAILABLE') {
        setApiNetworkAvailable(true);
        setIsOnline(navigator.onLine);
      }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    navigator.serviceWorker?.addEventListener('message', updateServiceWorkerStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      navigator.serviceWorker?.removeEventListener('message', updateServiceWorkerStatus);
    };
  }, []);

  useEffect(() => {
    const updateThemeMode = (event: Event) => {
      const { device, mode } = (event as CustomEvent<{ device: 'phone' | 'desktop'; mode: PhoneThemeMode }>).detail;
      if (device === 'phone') setPhoneThemeMode(mode);
      else setDesktopThemeMode(mode);
    };
    window.addEventListener(PHONE_THEME_MODE_EVENT, updateThemeMode);
    return () => window.removeEventListener(PHONE_THEME_MODE_EVENT, updateThemeMode);
  }, []);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsPhoneViewport(viewport.matches);
    updateViewport();
    viewport.addEventListener('change', updateViewport);
    return () => viewport.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    const activeMode = isPhoneViewport ? phoneThemeMode : desktopThemeMode;
    document.documentElement.classList.toggle('phone-dark', activeMode === 'dark');
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', activeMode === 'dark' ? '#18191a' : '#f7f8fa');
    return () => document.documentElement.classList.remove('phone-dark');
  }, [isPhoneViewport, phoneThemeMode, desktopThemeMode]);

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
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        onPrefetch={onPrefetch}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />
      <TopNav
        onMenuToggle={() => setSidebarCollapsed(c => !c)}
        onNavigate={onNavigate}
        onPrefetch={onPrefetch}
      />
      <main
        className="min-h-screen pt-[calc(72px+env(safe-area-inset-top))] md:pt-[72px] lg:pl-[260px]"
      >
        <div className={`mx-auto max-w-[1600px] ${isChatPage ? 'p-3 sm:p-4 lg:p-5' : 'p-4 sm:p-6 lg:p-8'}`}>
          {!isOnline && (
            <div role="status" className="offline-readonly-notice mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {language === 'fr'
                  ? 'Vous êtes hors ligne. Les données enregistrées sont affichées si disponibles. Les modifications sont désactivées jusqu’au rétablissement de la connexion ; certaines données n’ont peut-être pas encore été mises en cache. Les photos et documents ne sont pas disponibles hors ligne.'
                  : 'You are offline. Showing saved data where available. Changes are disabled until you reconnect; some records may not have been cached yet. Photos and documents are unavailable offline.'}
              </span>
            </div>
          )}
          <ActivityTrackingNotice />
          {children}
        </div>
      </main>
    </div>
  );
}
