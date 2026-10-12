import React from 'react';
import {
  LayoutDashboard, Home, Users, Wallet, ClipboardList,
  UserCheck, Bell, Settings, FileText, LogOut, X,
  Wrench, MessageCircle, UserPlus, UserRound, StickyNote, Building, Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const adminNavItems = [
  { id: 'dashboard',     labelKey: 'dashboard',     icon: LayoutDashboard },
  { id: 'houses',        labelKey: 'houses',        icon: Home },
  { id: 'tenants',       labelKey: 'tenants',       icon: Users },
  { id: 'caretakers',    labelKey: 'caretakers',    icon: UserRound },
  { id: 'property-managers', labelKey: 'propertyManagers', icon: Building },
  { id: 'invoices',      labelKey: 'invoices',      icon: StickyNote },
  { id: 'payments',      labelKey: 'payments',      icon: Wallet },
  { id: 'agreements',    labelKey: 'agreements',    icon: FileText },
  { id: 'maintenance',   labelKey: 'maintenance',   icon: Wrench },
  { id: 'visitors',      labelKey: 'visitors',      icon: UserCheck },
  { id: 'admin-chat',    labelKey: 'admin-chat',    icon: MessageCircle },
  { id: 'user-activity', labelKey: 'userActivity',  icon: Activity },
  { id: 'reports',       labelKey: 'reports',       icon: ClipboardList },
  { id: 'notifications', labelKey: 'notifications', icon: Bell },
  { id: 'settings',      labelKey: 'settings',      icon: Settings },
];

const gatekeeperNavItems = [
  { id: 'gk-dashboard', labelKey: 'gk-dashboard', icon: LayoutDashboard },
  { id: 'visitors',     labelKey: 'visitors',     icon: UserCheck },
];

const caretakerNavItems = [
  { id: 'caretaker-dashboard',          labelKey: 'caretaker-dashboard',          icon: LayoutDashboard },
  { id: 'invoices',                     labelKey: 'invoices',                     icon: StickyNote },
  { id: 'caretaker-visitors',           labelKey: 'caretaker-visitors',           icon: UserCheck },
  { id: 'caretaker-register-visitor',   labelKey: 'caretaker-register-visitor',   icon: UserPlus },
  { id: 'notifications',                labelKey: 'notifications',                icon: Bell },
  { id: 'caretaker-profile',            labelKey: 'caretaker-profile',            icon: Settings },
];

const tenantNavItems = [
  { id: 'tenant-dashboard',   labelKey: 'tenant-dashboard',   icon: LayoutDashboard },
  { id: 'tenant-payments',    labelKey: 'tenant-payments',    icon: Wallet },
  { id: 'tenant-invoices',    labelKey: 'tenant-invoices',    icon: StickyNote },
  { id: 'tenant-maintenance', labelKey: 'tenant-maintenance', icon: Wrench },
  { id: 'tenant-agreement',   labelKey: 'tenant-agreement',   icon: FileText },
  { id: 'tenant-chat',        labelKey: 'tenant-chat',        icon: MessageCircle },
  { id: 'notifications',      labelKey: 'notifications',      icon: Bell },
];

const propertyManagerNavItems = [
  { id: 'manager-dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { id: 'houses', labelKey: 'houses', icon: Home },
  { id: 'tenants', labelKey: 'tenants', icon: Users },
  { id: 'invoices', labelKey: 'invoices', icon: StickyNote },
  { id: 'payments', labelKey: 'payments', icon: Wallet },
  { id: 'maintenance', labelKey: 'maintenance', icon: Wrench },
  { id: 'visitors', labelKey: 'visitors', icon: UserCheck },
  { id: 'reports', labelKey: 'reports', icon: ClipboardList },
  { id: 'notifications', labelKey: 'notifications', icon: Bell },
];

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const { profile, signOut } = useAuth();
  const { t, appName, appLogoUrl } = useTheme();

  const navItems = profile?.role === 'admin'
    ? adminNavItems
    : profile?.role === 'gatekeeper'
    ? gatekeeperNavItems
    : profile?.role === 'caretaker'
    ? caretakerNavItems
    : profile?.role === 'property_manager'
    ? propertyManagerNavItems
    : tenantNavItems;

  const roleLabel = profile?.role === 'admin' ? t('administrator') : profile?.role === 'gatekeeper' ? t('gatekeeper') : profile?.role === 'caretaker' ? t('caretaker') : profile?.role === 'property_manager' ? t('propertyManager') : t('tenant');

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden" onClick={onToggle} />
      )}

      <aside className={`fixed top-0 left-0 h-full z-30 flex flex-col
          transition-all duration-300 ease-in-out ${
          collapsed ? '-translate-x-full lg:translate-x-0 lg:w-[72px]' : 'translate-x-0 w-[260px]'
        }`}
        style={{
          background: 'linear-gradient(180deg, #090b0d 0%, #101315 100%)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.05] min-h-[72px]">
          <img src={appLogoUrl} alt={`${appName} logo`} className="h-9 w-9 shrink-0 object-contain" />
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-white font-bold text-sm leading-tight tracking-tight">{appName}</p>
              <p className="text-slate-500 text-[10px] tracking-widest uppercase">{t('rentalManagement')}</p>
            </div>
          )}
          <button
            onClick={onToggle}
            className="lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={collapsed ? t(item.labelKey) : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
                style={isActive ? {
                  background: '#ffffff',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                } : {}}
              >
                <Icon className="shrink-0 w-[18px] h-[18px]" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.05] p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors group">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #2c3a4f, #1a2434)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {profile?.photo_url
                  ? <img src={profile.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  : <span className="text-sm font-bold text-white">{profile?.full_name?.charAt(0).toUpperCase()}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-tight">{profile?.full_name}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{roleLabel}</p>
              </div>
              <button
                onClick={signOut}
                title={t('signOut')}
                className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #2c3a4f, #1a2434)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {profile?.photo_url
                  ? <img src={profile.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  : <span className="text-sm font-bold text-white">{profile?.full_name?.charAt(0).toUpperCase()}</span>
                }
              </div>
              <button
                onClick={signOut}
                title={t('signOut')}
                className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
