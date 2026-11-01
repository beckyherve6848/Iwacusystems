import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserCheck, Users, LogIn } from 'lucide-react';
import DashboardWelcomeHero from '@/components/layout/DashboardWelcomeHero';

export default function GatekeeperDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ todayVisitors: 0, insideNow: 0, total: 0 });
  const [recentVisitors, setRecentVisitors] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    Promise.all([
      supabase.from('visitors').select('id, status, time_in').gte('time_in', today.toISOString()),
      supabase.from('visitors').select('*, houses(house_number), tenants(full_name)').order('time_in', { ascending: false }).limit(10),
    ]).then(([stats, recent]) => {
      const v = stats.data ?? [];
      setStats({
        todayVisitors: v.length,
        insideNow: v.filter(x => x.status === 'inside').length,
        total: v.length,
      });
      setRecentVisitors(recent.data ?? []);
    });
  }, []);

  return (
    <div className="dashboard-content space-y-6">
      <DashboardWelcomeHero
        title="Gatekeeper Dashboard"
        subtitle={`Welcome, ${profile?.full_name ?? ''}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-white" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.todayVisitors}</p>
          <p className="text-sm text-slate-500">Visitors Today</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center mb-3">
            <UserCheck className="w-5 h-5 text-white" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.insideNow}</p>
          <p className="text-sm text-slate-500">Currently Inside</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-center">
          <button
            onClick={() => onNavigate('visitors')}
            className="flex flex-col items-center gap-2 text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <LogIn className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium">Register Visitor</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Recent Visitors</h3>
        <div className="space-y-3">
          {recentVisitors.length === 0 && <p className="text-slate-400 text-sm">No visitors yet today</p>}
          {recentVisitors.map(v => (
            <div key={v.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">{v.visitor_name}</p>
                <p className="text-xs text-slate-400">{v.houses?.house_number} · {v.purpose} · {new Date(v.time_in).toLocaleTimeString()}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                v.status === 'inside' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>{v.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
