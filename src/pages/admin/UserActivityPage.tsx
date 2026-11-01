import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarClock, Eye, MessageSquareText, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Select } from '@/components/ui/Input';

type TrackedRole = 'tenant' | 'property_manager' | 'caretaker';
type ActivityType = 'page_view' | 'data_change' | 'chat_message';

interface TrackedProfile {
  id: string;
  full_name: string;
  email: string;
  role: TrackedRole;
}

interface ActivityEvent {
  id: string;
  actor_id: string;
  actor_role: TrackedRole;
  event_type: ActivityType;
  page_key: string | null;
  action_key: string | null;
  entity_table: string | null;
  entity_id: string | null;
  chat_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function UserActivityPage() {
  const { t, language } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [roleFilter, setRoleFilter] = useState<TrackedRole | ''>('');
  const [activityFilter, setActivityFilter] = useState<ActivityType | ''>('');
  const [profileSearch, setProfileSearch] = useState('');
  const [profileMatches, setProfileMatches] = useState<TrackedProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<TrackedProfile | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TrackedProfile>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [eventCounts, setEventCounts] = useState<Record<ActivityType, number>>({
    page_view: 0,
    data_change: 0,
    chat_message: 0,
  });
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [profileSearching, setProfileSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const term = profileSearch.trim();
    if (!term || term.length < 2 || selectedProfile) {
      setProfileMatches([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setProfileSearching(true);
      const safeTerm = term.replace(/[\\%_]/g, '\\$&');
      const [nameResults, emailResults] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .in('role', ['tenant', 'property_manager', 'caretaker'])
          .ilike('full_name', `%${safeTerm}%`)
          .order('full_name')
          .limit(10),
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .in('role', ['tenant', 'property_manager', 'caretaker'])
          .ilike('email', `%${safeTerm}%`)
          .order('full_name')
          .limit(10),
      ]);

      if (cancelled) return;
      if (nameResults.error) {
        addToast(`${t('userActivityLoadError')}: ${nameResults.error.message}`, 'error');
        setProfileMatches([]);
      } else if (emailResults.error) {
        addToast(`${t('userActivityLoadError')}: ${emailResults.error.message}`, 'error');
        setProfileMatches([]);
      } else {
        setProfileMatches([...nameResults.data, ...emailResults.data]
          .filter((record, index, all) => all.findIndex(item => item.id === record.id) === index)
          .slice(0, 10) as TrackedProfile[]);
      }
      setProfileSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileSearch, selectedProfile, addToast, t]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('user_activity_events')
      .select('id, actor_id, actor_role, event_type, page_key, action_key, entity_table, entity_id, chat_message_id, metadata, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (roleFilter) query = query.eq('actor_role', roleFilter);
    if (activityFilter) query = query.eq('event_type', activityFilter);
    if (selectedProfile) query = query.eq('actor_id', selectedProfile.id);

    const { data, count, error } = await query;
    if (error) {
      addToast(`${t('userActivityLoadError')}: ${error.message}`, 'error');
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ActivityEvent[];
    setEvents(rows);
    setTotal(count ?? 0);

    const actorIds = [...new Set(rows.map(event => event.actor_id))];
    const chatIds = rows.flatMap(event => event.chat_message_id ? [event.chat_message_id] : []);
    const [profileResult, messageResult] = await Promise.all([
      actorIds.length
        ? supabase.from('profiles').select('id, full_name, email, role').in('id', actorIds)
        : Promise.resolve({ data: [], error: null }),
      chatIds.length
        ? supabase.from('chat_messages').select('id, body').in('id', chatIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileResult.error) addToast(`${t('userActivityLoadError')}: ${profileResult.error.message}`, 'error');
    if (messageResult.error) addToast(`${t('userActivityLoadError')}: ${messageResult.error.message}`, 'error');
    setProfiles(Object.fromEntries((profileResult.data ?? []).map(record => [record.id, record as TrackedProfile])));
    setMessages(Object.fromEntries((messageResult.data ?? []).map(record => [record.id, record.body])));
    setLoading(false);
  }, [activityFilter, addToast, page, roleFilter, selectedProfile, t]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      if (!selectedProfile) {
        setEventCounts({ page_view: 0, data_change: 0, chat_message: 0 });
        setPageCounts({});
        return;
      }
      const { data, error } = await supabase.rpc('admin_user_activity_summary', {
        p_actor_id: selectedProfile.id,
      });
      if (error) {
        addToast(`${t('userActivityLoadError')}: ${error.message}`, 'error');
        return;
      }
      if (cancelled) return;
      const counts: Record<ActivityType, number> = { page_view: 0, data_change: 0, chat_message: 0 };
      const pageSummary: Record<string, number> = {};
      (data ?? []).forEach((row: { event_type: string; page_key: string | null; event_count: number }) => {
        if (row.event_type in counts) counts[row.event_type as ActivityType] = Number(row.event_count);
        if (row.event_type === 'page_view' && row.page_key) pageSummary[row.page_key] = Number(row.event_count);
      });
      const dashboardKey = selectedProfile.role === 'tenant'
        ? 'tenant-dashboard'
        : selectedProfile.role === 'property_manager'
          ? 'manager-dashboard'
          : 'caretaker-dashboard';
      pageSummary[dashboardKey] ??= 0;
      setEventCounts(counts);
      setPageCounts(pageSummary);
    };
    void loadCounts();
    return () => { cancelled = true; };
  }, [selectedProfile, roleFilter, addToast, t]);

  const selectProfile = (profile: TrackedProfile) => {
    setSelectedProfile(profile);
    setRoleFilter(profile.role);
    setProfileSearch(profile.full_name);
    setProfileMatches([]);
    setPage(0);
  };

  const deleteProfileActivity = async () => {
    if (!selectedProfile || deleting) return;
    const message = language === 'fr'
      ? `Supprimer définitivement tous les journaux d’activité de ${selectedProfile.full_name} ? Les messages originaux resteront dans la conversation d’assistance.`
      : `Permanently delete all activity logs for ${selectedProfile.full_name}? Original messages will remain in the support conversation.`;
    if (!window.confirm(message)) return;

    setDeleting(true);
    const { error, count } = await supabase
      .from('user_activity_events')
      .delete({ count: 'exact' })
      .eq('actor_id', selectedProfile.id);
    if (error) {
      addToast(`${t('userActivityDeleteError')}: ${error.message}`, 'error');
    } else {
      addToast(`${t('userActivityDeleted')}: ${count ?? 0}`, 'success');
      setEventCounts({ page_view: 0, data_change: 0, chat_message: 0 });
      setPageCounts({});
      setPage(0);
      if (page === 0) await loadEvents();
    }
    setDeleting(false);
  };

  const profileLabel = (profile: TrackedProfile) =>
    profile.role === 'property_manager' ? t('propertyManager') : t(profile.role);
  const eventLabel = (event: ActivityEvent) => {
    if (event.event_type === 'page_view') return t('userActivityPageView');
    if (event.event_type === 'chat_message') {
      return t(event.action_key === 'read_message' ? 'userActivityMessageRead' : 'userActivityMessageSent');
    }
    return t('userActivityChangedData');
  };
  const safeValuesLabel = (metadata: Record<string, unknown>) => {
    const values = metadata.safe_values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return '';
    return Object.entries(values as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ');
  };
  const timestamp = (value: string) => new Intl.DateTimeFormat(language === 'fr' ? 'fr-BI' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));

  return (
    <div className="space-y-5">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('userActivity')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('userActivityDescription')}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['page_view', Eye, t('userActivityPageViews')],
          ['data_change', Activity, t('userActivityChanges')],
          ['chat_message', MessageSquareText, t('userActivityMessages')],
        ] as const).map(([kind, Icon, label]) => (
          <div key={kind} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-xl font-bold text-slate-900">{selectedProfile ? eventCounts[kind] : '—'}</span>
              <span className="text-xs text-slate-500">{label}</span>
            </span>
          </div>
        ))}
      </div>
      {selectedProfile && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('userActivityPagesSummary')}</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(pageCounts)
              .sort(([, left], [, right]) => right - left)
              .map(([pageKey, visits]) => (
                <span key={pageKey} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                  {t(pageKey)} <strong className="ml-1">{visits}</strong>
                </span>
              ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
          <label className="text-xs font-medium text-slate-600">
            {t('userActivityRole')}
            <Select
              value={roleFilter}
              onChange={event => {
                setRoleFilter(event.target.value as TrackedRole | '');
                setSelectedProfile(null);
                setProfileSearch('');
                setPage(0);
              }}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="">{t('userActivityAllRoles')}</option>
              <option value="tenant">{t('tenant')}</option>
              <option value="property_manager">{t('propertyManager')}</option>
              <option value="caretaker">{t('caretaker')}</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            {t('userActivityType')}
            <Select
              value={activityFilter}
              onChange={event => { setActivityFilter(event.target.value as ActivityType | ''); setPage(0); }}
              className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <option value="">{t('userActivityAllTypes')}</option>
              <option value="page_view">{t('userActivityPageView')}</option>
              <option value="data_change">{t('userActivityChangedData')}</option>
              <option value="chat_message">{t('userActivityMessageSent')}</option>
            </Select>
          </label>
          <div className="relative text-xs font-medium text-slate-600">
            {t('userActivitySearchPerson')}
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={profileSearch}
                onChange={event => {
                  setProfileSearch(event.target.value);
                  setSelectedProfile(null);
                  setPage(0);
                }}
                placeholder={t('userActivitySearchPlaceholder')}
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800"
              />
            </div>
            {(profileMatches.length > 0 || profileSearching) && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {profileSearching && <p className="px-3 py-2 text-slate-500">{t('userActivitySearching')}</p>}
                {profileMatches.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => selectProfile(profile)}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="block text-sm text-slate-800">{profile.full_name}</span>
                    <span className="block text-xs text-slate-500">{profile.email} · {profileLabel(profile)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-end gap-2">
            {selectedProfile && (
              <button
                type="button"
                onClick={deleteProfileActivity}
                disabled={deleting}
                title={t('userActivityDeleteAll')}
                aria-label={t('userActivityDeleteAll')}
                className="inline-flex h-[42px] items-center gap-2 rounded-xl bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden xl:inline">{deleting ? t('deleting') : t('userActivityDeleteAll')}</span>
              </button>
            )}
          </div>
        </div>
        {selectedProfile && (
          <p className="mt-3 text-xs text-slate-500">
            {t('userActivityTracking')} <strong className="text-slate-700">{selectedProfile.full_name}</strong> · {profileLabel(selectedProfile)}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">{t('userActivityTimeline')}</h2>
          <span className="text-xs text-slate-500">{total.toLocaleString(language === 'fr' ? 'fr-BI' : 'en-US')} {t('userActivityEvents')}</span>
        </div>
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">{t('userActivityLoading')}</p>
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">{t('userActivityEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map(event => {
              const actor = profiles[event.actor_id] ?? (selectedProfile?.id === event.actor_id ? selectedProfile : null);
              const detail = event.event_type === 'page_view'
                ? event.page_key ? t(event.page_key) : '—'
                : event.event_type === 'chat_message'
                  ? event.chat_message_id ? messages[event.chat_message_id] ?? t('userActivityMessageDeleted') : '—'
                  : `${event.action_key ?? ''}${event.entity_id ? ` · ${event.entity_id}` : ''}${
                      Array.isArray(event.metadata.changed_fields) && event.metadata.changed_fields.length
                        ? ` · ${event.metadata.changed_fields.join(', ')}`
                        : ''
                    }${
                      safeValuesLabel(event.metadata)
                        ? ` · ${safeValuesLabel(event.metadata)}`
                        : ''
                    }`;
              return (
                <li key={event.id} className="flex gap-3 px-4 py-4 sm:px-5">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    event.event_type === 'page_view' ? 'bg-blue-50 text-blue-700'
                      : event.event_type === 'chat_message' ? 'bg-violet-50 text-violet-700'
                        : 'bg-amber-50 text-amber-700'
                  }`}>
                    {event.event_type === 'page_view' ? <Eye className="h-4 w-4" />
                      : event.event_type === 'chat_message' ? <MessageSquareText className="h-4 w-4" />
                        : <Activity className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm font-semibold text-slate-900">{actor?.full_name ?? t('userActivityUnknownUser')}</p>
                      <span className="text-xs text-slate-500">{actor ? profileLabel(actor) : t(event.actor_role)}</span>
                      <span className="text-xs font-medium text-slate-600">{eventLabel(event)}</span>
                    </div>
                    <p className={`mt-1 break-words text-sm ${
                      event.event_type === 'chat_message' ? 'whitespace-pre-wrap text-slate-700' : 'text-slate-600'
                    }`}>{detail}</p>
                    {actor?.email && <p className="mt-1 truncate text-xs text-slate-400">{actor.email}</p>}
                  </div>
                  <time className="flex shrink-0 items-center gap-1 text-right text-[11px] text-slate-400">
                    <CalendarClock className="hidden h-3.5 w-3.5 sm:block" />
                    {timestamp(event.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              disabled={page === 0 || loading}
              onClick={() => setPage(value => Math.max(0, value - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40"
            >
              {t('previous')}
            </button>
            <span className="text-xs text-slate-500">{page + 1} / {Math.ceil(total / PAGE_SIZE)}</span>
            <button
              type="button"
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              onClick={() => setPage(value => value + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40"
            >
              {t('next')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
