import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search, LogIn, LogOut, UserCheck, Eye, Users,
} from 'lucide-react';
import { supabase, Visitor } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';

const PER_PAGE = 10;

type FilterTab = 'today' | 'week' | 'inside' | 'outside';

export default function CaretakerVisitorsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { t, language } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('today');
  const [loading, setLoading] = useState(true);
  const [detailVisitor, setDetailVisitor] = useState<Visitor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('visitors')
      .select('*, houses(house_number), tenants(full_name)', { count: 'exact' })
      .order('created_at', { ascending: false });

    const now = new Date();
    if (filter === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      q = q.gte('created_at', todayStart);
    } else if (filter === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      q = q.gte('created_at', weekStart.toISOString());
    } else if (filter === 'inside') {
      q = q.eq('status', 'inside');
    } else if (filter === 'outside') {
      q = q.eq('status', 'left');
    }

    if (search) {
      q = q.or(`visitor_name.ilike.%${search}%,tenants.full_name.ilike.%${search}%`);
    }

    const from = (page - 1) * PER_PAGE;
    q = q.range(from, from + PER_PAGE - 1);

    const { data, count, error } = await q;
    if (error) { addToast(error.message, 'error'); }
    else { setVisitors(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, search, filter, addToast]);

  useEffect(() => { load(); }, [load]);

  const handleCheckIn = async (v: Visitor) => {
    const { error } = await supabase
      .from('visitors')
      .update({ status: 'inside', time_in: new Date().toISOString(), time_out: null })
      .eq('id', v.id);
    if (error) addToast(error.message, 'error');
    else { addToast(`${v.visitor_name} ${language === 'fr' ? 'est arrivé' : 'checked in'}`, 'success'); load(); }
  };

  const handleCheckOut = async (v: Visitor) => {
    const { error } = await supabase
      .from('visitors')
      .update({ status: 'left', time_out: new Date().toISOString() })
      .eq('id', v.id);
    if (error) addToast(error.message, 'error');
    else { addToast(`${v.visitor_name} ${language === 'fr' ? 'est parti' : 'checked out'}`, 'success'); load(); }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'today', label: t('today') },
    { key: 'week', label: t('thisWeek') },
    { key: 'inside', label: t('checkedIn') },
    { key: 'outside', label: t('checkedOut') },
  ];

  const panelClass = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('visitors')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('manageVisitorActivity')}</p>
        </div>
        <button
          onClick={() => onNavigate('caretaker-register-visitor')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <UserCheck className="w-4 h-4" /> {t('registerVisitor')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setPage(1); }}
              className={`px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filter === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('searchVisitorPlaceholder')}
            className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className={`${panelClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('visitor')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">{t('tenant')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{t('apartment')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('checkInAt')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{t('checkOutAt')}</th>
                <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('status')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && visitors.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">{t('noVisitorsFound')}</td></tr>
              )}
              {visitors.map((v, i) => (
                <motion.tr
                  key={v.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-900 text-sm">{v.visitor_name}</p>
                    <p className="text-xs text-slate-400">{v.phone ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate-700">
                    {v.tenants?.full_name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell text-sm text-slate-700">
                    {v.houses?.house_number ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate-500">
                    {v.time_in ? new Date(v.time_in).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate-500">
                    {v.time_out ? new Date(v.time_out).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`visitor-status-pill inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${
                      v.status === 'inside' ? 'bg-emerald-50 text-emerald-700' : 'visitor-status-left bg-slate-100 text-slate-500'
                    }`}>
                      {v.status === 'inside' ? t('inside') : t('left')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailVisitor(v)}
                        title={t('viewDetails')}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {v.status === 'left' && (
                        <button
                          onClick={() => handleCheckIn(v)}
                          title={t('checkIn')}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        >
                          <LogIn className="w-4 h-4" />
                        </button>
                      )}
                      {v.status === 'inside' && (
                        <button
                          onClick={() => handleCheckOut(v)}
                          title={t('checkOut')}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-5 py-3">
          <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailVisitor} onClose={() => setDetailVisitor(null)} title={t('visitorDetails')} size="md">
        {detailVisitor && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{detailVisitor.visitor_name}</p>
                <p className="text-sm text-slate-500">{detailVisitor.phone ?? t('noPhone')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">{t('nationalId')}</p><p className="font-medium text-slate-700">{detailVisitor.national_id ?? '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('purpose')}</p><p className="font-medium text-slate-700">{detailVisitor.purpose}</p></div>
              <div><p className="text-xs text-slate-400">{t('tenant')}</p><p className="font-medium text-slate-700">{detailVisitor.tenants?.full_name ?? '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('apartment')}</p><p className="font-medium text-slate-700">{detailVisitor.houses?.house_number ?? '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('visitorsCount')}</p><p className="font-medium text-slate-700">{detailVisitor.number_of_visitors ?? 1}</p></div>
              <div><p className="text-xs text-slate-400">{t('status')}</p><p className="font-medium text-slate-700">{detailVisitor.status === 'inside' ? t('inside') : t('left')}</p></div>
              <div><p className="text-xs text-slate-400">{t('checkInAt')}</p><p className="font-medium text-slate-700">{detailVisitor.time_in ? new Date(detailVisitor.time_in).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('checkOutAt')}</p><p className="font-medium text-slate-700">{detailVisitor.time_out ? new Date(detailVisitor.time_out).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('expectedDeparture')}</p><p className="font-medium text-slate-700">{detailVisitor.expected_departure ? new Date(detailVisitor.expected_departure).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB') : '—'}</p></div>
              <div><p className="text-xs text-slate-400">{t('visitDate')}</p><p className="font-medium text-slate-700">{detailVisitor.visit_date ?? '—'}</p></div>
            </div>
            {detailVisitor.notes && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-1">{t('notes')}</p>
                <p className="text-sm text-slate-700">{detailVisitor.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              {detailVisitor.status === 'left' && (
                <button
                  onClick={() => { handleCheckIn(detailVisitor); setDetailVisitor(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  <LogIn className="w-4 h-4" /> Check In
                </button>
              )}
              {detailVisitor.status === 'inside' && (
                <button
                  onClick={() => { handleCheckOut(detailVisitor); setDetailVisitor(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Check Out
                </button>
              )}
              <button
                onClick={() => setDetailVisitor(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
