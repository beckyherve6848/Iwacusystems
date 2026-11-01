import React, { lazy, Suspense, useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
import TenantPendingScreen from '@/pages/tenant/TenantPendingScreen';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import { supabase } from '@/lib/supabase';

const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const HousesPage = lazy(() => import('@/pages/admin/HousesPage'));
const TenantsPage = lazy(() => import('@/pages/admin/TenantsPage'));
const CaretakersPage = lazy(() => import('@/pages/admin/CaretakersPage'));
const InvoicesPage = lazy(() => import('@/pages/admin/InvoicesPage'));
const PaymentsPage = lazy(() => import('@/pages/admin/PaymentsPage'));
const MaintenancePage = lazy(() => import('@/pages/admin/MaintenancePage'));
const AgreementsPage = lazy(() => import('@/pages/admin/AgreementsPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'));
const GatekeeperDashboard = lazy(() => import('@/pages/gatekeeper/GatekeeperDashboard'));
const AdminChatPage = lazy(() => import('@/pages/admin/AdminChatPage'));
const TenantDashboard = lazy(() => import('@/pages/tenant/TenantDashboard'));
const TenantPaymentsPage = lazy(() => import('@/pages/tenant/TenantPaymentsPage'));
const TenantInvoicesPage = lazy(() => import('@/pages/tenant/TenantInvoicesPage'));
const TenantMaintenancePage = lazy(() => import('@/pages/tenant/TenantMaintenancePage'));
const TenantAgreementPage = lazy(() => import('@/pages/tenant/TenantAgreementPage'));
const TenantChatPage = lazy(() => import('@/pages/tenant/TenantChatPage'));
const CaretakerDashboard = lazy(() => import('@/pages/caretaker/CaretakerDashboard'));
const CaretakerVisitorsPage = lazy(() => import('@/pages/caretaker/CaretakerVisitorsPage'));
const CaretakerRegisterVisitorPage = lazy(() => import('@/pages/caretaker/CaretakerRegisterVisitorPage'));
const CaretakerProfilePage = lazy(() => import('@/pages/caretaker/CaretakerProfilePage'));
const PropertyManagersPage = lazy(() => import('@/pages/admin/PropertyManagersPage'));
const PropertyManagerDashboard = lazy(() => import('@/pages/property-manager/PropertyManagerDashboard'));
const VisitorsPage = lazy(() => import('@/pages/VisitorsPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const UserActivityPage = lazy(() => import('@/pages/admin/UserActivityPage'));

const propertyManagerPages = new Set([
  'manager-dashboard', 'houses', 'tenants', 'invoices', 'payments', 'maintenance', 'visitors', 'reports', 'notifications', 'manager-chat',
]);

const defaultPageByRole: Record<string, string> = {
  admin: 'dashboard',
  gatekeeper: 'gk-dashboard',
  caretaker: 'caretaker-dashboard',
  property_manager: 'manager-dashboard',
  tenant: 'tenant-dashboard',
};

const pagesByRole: Record<string, Set<string>> = {
  admin: new Set([
    'dashboard', 'houses', 'tenants', 'caretakers', 'property-managers', 'invoices',
    'payments', 'agreements', 'maintenance', 'reports', 'settings', 'admin-chat',
    'visitors', 'notifications', 'user-activity',
  ]),
  gatekeeper: new Set(['gk-dashboard', 'visitors']),
  caretaker: new Set([
    'caretaker-dashboard', 'invoices', 'caretaker-visitors', 'caretaker-register-visitor',
    'notifications', 'caretaker-profile', 'caretaker-chat',
  ]),
  property_manager: propertyManagerPages,
  tenant: new Set([
    'tenant-dashboard', 'tenant-payments', 'tenant-invoices', 'tenant-maintenance',
    'tenant-agreement', 'tenant-chat', 'notifications',
  ]),
};

function AppContent() {
  const { session, profile, tenantRecord, tenantChecked, loading } = useAuth();
  const { appLogoUrl, appName, language } = useTheme();
  const [currentPage, setCurrentPage] = useState('');
  const profileId = profile?.id;
  const profileRole = profile?.role;

  useEffect(() => {
    const title = language === 'fr'
      ? `${appName} | Gestion locative au Burundi`
      : `${appName} | Rental Property Management in Burundi`;
    const description = language === 'fr'
      ? `Gérez vos biens locatifs au Burundi avec ${appName}. Suivez locataires, contrats, factures, paiements, maintenance et visiteurs au même endroit.`
      : `Manage rental properties in Burundi with ${appName}. Track tenants, lease agreements, rent invoices, payments, maintenance, and visitors in one place.`;

    document.documentElement.lang = language === 'fr' ? 'fr-BI' : 'en';
    document.title = title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.setAttribute('content', language === 'fr' ? 'fr_BI' : 'en_BI');
    document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', description);
  }, [appName, language]);

  useEffect(() => {
    if (!profileId || !profileRole) return;
    const initialPage = defaultPageByRole[profileRole] ?? 'tenant-dashboard';
    const historyState = window.history.state as {
      appPage?: unknown;
      userId?: unknown;
      role?: unknown;
    } | null;
    const canRestorePage = historyState?.userId === profileId
      && historyState.role === profileRole
      && typeof historyState.appPage === 'string'
      && pagesByRole[profileRole]?.has(historyState.appPage);
    const page = canRestorePage ? historyState.appPage as string : initialPage;

    setCurrentPage(page);
    window.history.replaceState({ appPage: page, userId: profileId, role: profileRole }, '');
  }, [profileId, profileRole]);

  useEffect(() => {
    if (!profileId || !profileRole) return;
    const handlePopState = (event: PopStateEvent) => {
      const page = event.state?.appPage;
      const isSameUser = event.state?.userId === profileId && event.state?.role === profileRole;
      setCurrentPage(
        isSameUser && typeof page === 'string' && pagesByRole[profileRole]?.has(page)
          ? page
          : defaultPageByRole[profileRole] ?? 'tenant-dashboard',
      );
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [profileId, profileRole]);

  useEffect(() => {
    if (!profileId || !profileRole || !currentPage || !['tenant', 'property_manager', 'caretaker'].includes(profileRole)) return;
    supabase.from('user_activity_events').insert({
      actor_id: profileId,
      actor_role: profileRole,
      event_type: 'page_view',
      page_key: currentPage,
    }).then(({ error }) => {
      if (error) console.error('Unable to record page activity:', error.message);
    });
  }, [profileId, profileRole, currentPage]);

  if (loading || (profile?.role === 'tenant' && !tenantChecked)) {
    return (
      <div className="app-loading-screen" role="status" aria-label="Loading">
        <div className="flex flex-col items-center gap-5">
          <div className="loading-orbit" aria-hidden="true">
            <div className="loading-orbit-dots">
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  key={index}
                  className="loading-orbit-dot"
                  style={{
                    transform: `rotate(${index * 30}deg) translateY(-39px)`,
                    opacity: 0.25 + index * 0.06,
                  }}
                />
              ))}
            </div>
            <img className="loading-logo" src={appLogoUrl} alt="" />
          </div>
          <p className="text-sm tracking-wide text-white/65">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AuthPage onSuccess={() => {}} />
      </Suspense>
    );
  }

  // Tenants without a completed profile see a waiting screen instead of the dashboard
  if (profile.role === 'tenant' && !tenantRecord) {
    return <TenantPendingScreen />;
  }
  if (profile.role === 'property_manager' && !profile.is_active) {
    return <TenantPendingScreen />;
  }

  const navigate = (page: string) => {
    if (profile.role === 'property_manager' && !propertyManagerPages.has(page)) return;
    window.history.pushState({ appPage: page, userId: profile.id, role: profile.role }, '');
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <AdminDashboard onNavigate={navigate} />;
      case 'houses': return <HousesPage managerMode={profile.role === 'property_manager'} />;
      case 'tenants': return <TenantsPage />;
      case 'caretakers': return <CaretakersPage />;
      case 'property-managers': return profile.role === 'admin' ? <PropertyManagersPage /> : null;
      case 'invoices': return <InvoicesPage />;
      case 'payments': return <PaymentsPage />;
      case 'agreements': return <AgreementsPage />;
      case 'maintenance': return <MaintenancePage />;
      case 'reports': return <ReportsPage />;
      case 'settings': return <SettingsPage />;
      case 'gk-dashboard': return <GatekeeperDashboard onNavigate={navigate} />;
      case 'manager-dashboard': return profile.role === 'property_manager' ? <PropertyManagerDashboard onNavigate={navigate} /> : null;
      case 'caretaker-dashboard': return <CaretakerDashboard onNavigate={navigate} />;
      case 'caretaker-visitors': return <CaretakerVisitorsPage onNavigate={navigate} />;
      case 'caretaker-register-visitor': return <CaretakerRegisterVisitorPage onNavigate={navigate} />;
      case 'caretaker-profile': return <CaretakerProfilePage onNavigate={navigate} />;
      case 'caretaker-chat': return profile.role === 'caretaker' ? <AdminChatPage /> : null;
      case 'tenant-dashboard': return <TenantDashboard onNavigate={navigate} />;
      case 'tenant-payments': return <TenantPaymentsPage />;
      case 'tenant-invoices': return <TenantInvoicesPage />;
      case 'tenant-maintenance': return <TenantMaintenancePage />;
      case 'tenant-agreement': return <TenantAgreementPage />;
      case 'tenant-chat': return <TenantChatPage />;
      case 'admin-chat': return <AdminChatPage />;
      case 'manager-chat': return profile.role === 'property_manager' ? <AdminChatPage /> : null;
      case 'visitors': return <VisitorsPage />;
      case 'notifications': return <NotificationsPage />;
      case 'user-activity': return profile.role === 'admin' ? <UserActivityPage /> : null;
      default: return (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400 dark:text-slate-500">Select a page from the sidebar</p>
        </div>
      );
    }
  };

  return (
    <AppLayout currentPage={currentPage} onNavigate={navigate}>
      <Suspense fallback={<PageLoadingFallback />}>
        {renderPage()}
      </Suspense>
    </AppLayout>
  );
}

function PageLoadingFallback() {
  return (
    <div className="min-h-[50vh] space-y-5 py-2" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page...</span>
      <div className="h-36 animate-pulse rounded-3xl bg-slate-200 sm:h-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-white shadow-sm" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <PwaInstallPrompt />
      </AuthProvider>
    </ThemeProvider>
  );
}
