import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
import AuthPage from '@/pages/AuthPage';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import HousesPage from '@/pages/admin/HousesPage';
import TenantsPage from '@/pages/admin/TenantsPage';
import CaretakersPage from '@/pages/admin/CaretakersPage';
import InvoicesPage from '@/pages/admin/InvoicesPage';
import PaymentsPage from '@/pages/admin/PaymentsPage';
import MaintenancePage from '@/pages/admin/MaintenancePage';
import AgreementsPage from '@/pages/admin/AgreementsPage';
import ReportsPage from '@/pages/admin/ReportsPage';
import SettingsPage from '@/pages/admin/SettingsPage';
import GatekeeperDashboard from '@/pages/gatekeeper/GatekeeperDashboard';
import AdminChatPage from '@/pages/admin/AdminChatPage';
import TenantDashboard from '@/pages/tenant/TenantDashboard';
import TenantPaymentsPage from '@/pages/tenant/TenantPaymentsPage';
import TenantInvoicesPage from '@/pages/tenant/TenantInvoicesPage';
import TenantMaintenancePage from '@/pages/tenant/TenantMaintenancePage';
import TenantAgreementPage from '@/pages/tenant/TenantAgreementPage';
import TenantChatPage from '@/pages/tenant/TenantChatPage';
import TenantPendingScreen from '@/pages/tenant/TenantPendingScreen';
import CaretakerDashboard from '@/pages/caretaker/CaretakerDashboard';
import CaretakerVisitorsPage from '@/pages/caretaker/CaretakerVisitorsPage';
import CaretakerRegisterVisitorPage from '@/pages/caretaker/CaretakerRegisterVisitorPage';
import CaretakerProfilePage from '@/pages/caretaker/CaretakerProfilePage';
import PropertyManagersPage from '@/pages/admin/PropertyManagersPage';
import PropertyManagerDashboard from '@/pages/property-manager/PropertyManagerDashboard';
import VisitorsPage from '@/pages/VisitorsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import UserActivityPage from '@/pages/admin/UserActivityPage';
import { supabase } from '@/lib/supabase';

const propertyManagerPages = new Set([
  'manager-dashboard', 'houses', 'tenants', 'invoices', 'payments', 'maintenance', 'visitors', 'reports', 'notifications',
]);

function AppContent() {
  const { session, profile, tenantRecord, tenantChecked, loading } = useAuth();
  const { appLogoUrl } = useTheme();
  const [currentPage, setCurrentPage] = useState('');

  useEffect(() => {
    if (!profile) return;
    const initialPage = profile.role === 'admin'
      ? 'dashboard'
      : profile.role === 'gatekeeper'
        ? 'gk-dashboard'
        : profile.role === 'caretaker'
          ? 'caretaker-dashboard'
          : profile.role === 'property_manager'
            ? 'manager-dashboard'
            : 'tenant-dashboard';
    setCurrentPage(initialPage);
    window.history.replaceState({ appPage: initialPage }, '');
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && typeof event.state.appPage === 'string') {
        setCurrentPage(profile.role === 'property_manager' && !propertyManagerPages.has(event.state.appPage)
          ? 'manager-dashboard'
          : event.state.appPage);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [profile]);

  useEffect(() => {
    if (!profile || !currentPage || !['tenant', 'property_manager', 'caretaker'].includes(profile.role)) return;
    supabase.from('user_activity_events').insert({
      actor_id: profile.id,
      actor_role: profile.role,
      event_type: 'page_view',
      page_key: currentPage,
    }).then(({ error }) => {
      if (error) console.error('Unable to record page activity:', error.message);
    });
  }, [profile, currentPage]);

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
    return <AuthPage onSuccess={() => {}} />;
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
    window.history.pushState({ appPage: page }, '');
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
      case 'tenant-dashboard': return <TenantDashboard onNavigate={navigate} />;
      case 'tenant-payments': return <TenantPaymentsPage />;
      case 'tenant-invoices': return <TenantInvoicesPage />;
      case 'tenant-maintenance': return <TenantMaintenancePage />;
      case 'tenant-agreement': return <TenantAgreementPage />;
      case 'tenant-chat': return <TenantChatPage />;
      case 'admin-chat': return <AdminChatPage />;
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
      {renderPage()}
    </AppLayout>
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
