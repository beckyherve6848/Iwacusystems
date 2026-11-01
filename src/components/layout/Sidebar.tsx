import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Home, Users, Wallet, ClipboardList,
  UserCheck, Bell, Settings, FileText, LogOut, X,
  Wrench, MessageCircle, UserPlus, UserRound, StickyNote, Building, Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { supabase } from '@/lib/supabase';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onPrefetch?: (page: string) => void;
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
  { id: 'caretaker-chat',               labelKey: 'managerCallCenter',            icon: MessageCircle },
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
  { id: 'manager-chat', labelKey: 'managerCallCenter', icon: MessageCircle },
  { id: 'notifications', labelKey: 'notifications', icon: Bell },
];

export default function Sidebar({ currentPage, onNavigate, onPrefetch, collapsed, onToggle }: SidebarProps) {
  const { profile, tenantRecord, signOut } = useAuth();
  const { t, appName, appLogoUrl } = useTheme();
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadInvoiceCount, setUnreadInvoiceCount] = useState(0);

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

  useEffect(() => {
    if (!profile?.id || profile.role === 'gatekeeper') {
      setUnreadChatCount(0);
      return;
    }

    const loadUnreadChatCount = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('sender_id, read_at, admin_read_at, chat_conversations(conversation_type)')
        .neq('sender_id', profile.id);
      if (error) {
        console.error('Unable to load unread chat message count:', error.message);
        return;
      }

      const count = (data ?? []).filter(message => {
        const conversation = Array.isArray(message.chat_conversations)
          ? message.chat_conversations[0]
          : message.chat_conversations;
        const readAt = profile.role === 'admin' && conversation?.conversation_type === 'manager_tenant'
          ? message.admin_read_at
          : message.read_at;
        return !readAt;
      }).length;
      setUnreadChatCount(count);
    };

    void loadUnreadChatCount();
    const channel = supabase
      .channel(`sidebar-chat-unread-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, loadUnreadChatCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'tenant') {
      setUnreadInvoiceCount(0);
      return;
    }

    const loadUnreadInvoiceCount = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('link', 'tenant-invoices')
        .eq('is_read', false)
        .not('invoice_id', 'is', null);
      if (error) {
        console.error('Unable to load unread invoice notification count:', error.message);
        return;
      }
      setUnreadInvoiceCount(count ?? 0);
    };

    void loadUnreadInvoiceCount();
    const channel = supabase
      .channel(`sidebar-invoice-unread-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, loadUnreadInvoiceCount)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile?.id, profile?.role]);

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-x-0 bottom-0 top-14 bg-black/50 backdrop-blur-sm z-20 lg:inset-0" onClick={onToggle} />
      )}

      <aside       className={`app-sidebar fixed left-0 top-14 h-[calc(100dvh-3.5rem)] rounded-3xl border-r border-white/[0.08] z-30 flex flex-col overflow-hidden lg:top-0 lg:h-full lg:rounded-none lg:border-r-white/[0.08]
          transition-[transform,width,border-radius] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? '-translate-x-full lg:translate-x-0 lg:w-[260px]' : 'translate-x-0 w-[260px]'
        }`}
        style={{
          backdropFilter: 'blur(22px) saturate(150%)',
          WebkitBackdropFilter: 'blur(22px) saturate(150%)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.05] min-h-[72px]">
          <img src={appLogoUrl} alt={`${appName} logo`} className="h-9 w-9 shrink-0 object-contain" />
          <div className="overflow-hidden flex-1">
            <p className="text-white font-bold text-sm leading-tight tracking-tight">{appName}</p>
            <p className="text-slate-500 text-[10px] tracking-widest uppercase">{t('rentalManagement')}</p>
          </div>
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
                onPointerEnter={() => onPrefetch?.(item.id)}
                onPointerDown={() => onPrefetch?.(item.id)}
                onFocus={() => onPrefetch?.(item.id)}
                onClick={() => onNavigate(item.id)}
                className={`app-sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                  isActive
                    ? 'app-sidebar-item-active text-slate-900'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
                style={isActive ? {
                  background: '#ffffff',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                } : {}}
              >
                {item.id === 'admin-chat' || item.id === 'manager-chat' || item.id === 'caretaker-chat' || item.id === 'tenant-chat'
                  ? <WhatsAppIcon className="shrink-0 w-[18px] h-[18px]" />
                  : <Icon className="shrink-0 w-[18px] h-[18px]" />}
                <span className="truncate">{t(item.labelKey)}</span>
                {['admin-chat', 'manager-chat', 'caretaker-chat', 'tenant-chat'].includes(item.id) && unreadChatCount > 0 && (
                  <span
                    aria-label={`${unreadChatCount} unread messages`}
                    title={`${unreadChatCount} unread messages`}
                    className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
                {item.id === 'tenant-invoices' && unreadInvoiceCount > 0 && (
                  <span
                    aria-label={`${unreadInvoiceCount} unread invoice notifications`}
                    title={`${unreadInvoiceCount} unread invoice notifications`}
                    className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border border-emerald-500 px-1 text-[10px] font-bold leading-none text-emerald-500"
                  >
                    {unreadInvoiceCount > 9 ? '9+' : unreadInvoiceCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.05] p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors group">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #2c3a4f, #1a2434)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {profile?.role === 'tenant'
                ? tenantRecord?.photo_url
                  ? <img src={tenantRecord.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  : <UserRound className="h-4 w-4 text-white" />
                : profile?.photo_url
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
        </div>
      </aside>
    </>
  );
}
