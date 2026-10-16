import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  UserCheck, LogIn, LogOut, UserPlus, Users,
  CalendarDays, TrendingUp, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';
import StaffIdentityCard from '@/components/identity/StaffIdentityCard';

interface DashboardStats {
  visitorsToday: number;
  visitorsInside: number;
  visitorsThisMonth: number;
  recentVisitors: {
    id: string;
    visitor_name: string;
    purpose: string;
    status: 'inside' | 'left';
    created_at: string;
    tenants?: { full_name: string } | null;
    houses?: { house_number: string } | null;
  }[];
}

export default function CaretakerDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile } = useAuth();
  const { t } = useTheme();
  const [stats, setStats] = useState<DashboardStats>({
    visitorsToday: 0, visitorsInside: 0, visitorsThisMonth: 0, recentVisitors: [],
  });
  const [assignedHouses, setAssignedHouses] = useState<string[]>([]);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [todayRes, insideRes, monthRes, recentRes] = await Promise.all([
      supabase.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('visitors').select('id', { count: 'exact', head: true }).eq('status', 'inside'),
      supabase.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('visitors')
        .select('*, houses(house_number), tenants(full_name)')
        .order('created_at', { ascending: false }).limit(5),
    ]);

    setStats({
      visitorsToday: todayRes.count ?? 0,
      visitorsInside: insideRes.count ?? 0,
      visitorsThisMonth: monthRes.count ?? 0,
      recentVisitors: recentRes.data ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile?.assigned_property_group_id) {
      setAssignedHouses([]);
      setAssignmentError(null);
      return;
    }
    const propertyId = profile.assigned_property_group_id;
    let cancelled = false;
    const loadAssignedHouses = async () => {
      try {
        const { data, error } = await supabase.from('houses').select('house_number')
          .eq('property_id', propertyId)
          .order('house_number');
        if (cancelled) return;
        if (error) setAssignmentError(`Unable to load assigned houses: ${error.message}`);
        else {
          setAssignmentError(null);
          setAssignedHouses((data ?? []).map(house =>
            `${profile.assigned_property_name || 'Assigned property'} · ${house.house_number}`));
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setAssignmentError(`Unable to load assigned houses: ${caught instanceof Error ? caught.message : 'Unknown error'}`);
        }
      }
    };
    void loadAssignedHouses();
    return () => { cancelled = true; };
  }, [profile?.assigned_property_group_id, profile?.assigned_property_name]);

  const panelClass = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

  const quickActions = [
    { label: t('registerVisitor'), icon: UserPlus, page: 'caretaker-register-visitor', color: 'bg-emerald-500' },
    { label: t('viewVisitors'), icon: Users, page: 'caretaker-visitors', color: 'bg-blue-500' },
    { label: t('checkIn'), icon: LogIn, page: 'caretaker-visitors', color: 'bg-amber-500' },
    { label: t('checkOut'), icon: LogOut, page: 'caretaker-visitors', color: 'bg-rose-500' },
    { label: t('viewProfile'), icon: UserCheck, page: 'caretaker-profile', color: 'bg-violet-500' },
  ];

  const statCards = [
    { label: t('todayVisitors'), value: stats.visitorsToday, icon: CalendarDays, color: 'bg-blue-500' },
    { label: t('currentlyInside'), value: stats.visitorsInside, icon: LogIn, color: 'bg-emerald-500' },
    { label: t('thisMonth'), value: stats.visitorsThisMonth, icon: TrendingUp, color: 'bg-violet-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <DashboardWelcomeHero
          title={`${t('welcome')}, ${profile?.full_name?.split(' ')[0] ?? t('caretaker')}`}
          subtitle={profile?.assigned_property_name ?? t('noPropertyAssigned')}
        />
      </motion.div>
      <div className="-mx-4 -mt-4 space-y-4 rounded-t-3xl bg-slate-200 px-4 pb-4 pt-5 sm:mx-0 sm:mt-0 sm:space-y-6 sm:rounded-none sm:bg-transparent sm:p-0">
      {profile && <StaffIdentityCard profile={profile} assignedProperties={assignedHouses} showIdentityDocument={false} />}
      {assignmentError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{assignmentError}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`${panelClass} p-3 sm:p-5`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${card.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="text-[11px] leading-4 sm:text-xs text-slate-500">{card.label}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className={`${panelClass} p-3 sm:p-5`}
      >
        <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('quickActions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map(action => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.label}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate(action.page)}
                className="flex flex-col items-center gap-1.5 p-2.5 sm:gap-2 sm:p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${action.color} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-slate-700 text-center">{action.label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Recent visitors */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className={`${panelClass} p-3 sm:p-5`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">{t('recentVisitorRegistrations')}</h3>
          <button
            onClick={() => onNavigate('caretaker-visitors')}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            {t('viewAll')} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {stats.recentVisitors.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">{t('noVisitorsRegistered')}</p>
        ) : (
          <div className="space-y-2">
            {stats.recentVisitors.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{v.visitor_name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {v.tenants?.full_name ?? '—'} · {v.houses?.house_number ?? '—'} · {v.purpose}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    v.status === 'inside' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {v.status === 'inside' ? t('inside') : t('left')}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(v.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
}
