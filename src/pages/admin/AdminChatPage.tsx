import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Send, Search, MessageCircle, ArrowLeft,
  Smile, CheckCheck, Copy, Reply, Trash2,
  MessagesSquare, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Modal from '@/components/ui/Modal';

interface Conversation {
  id: string;
  tenant_id: string;
  updated_at: string;
  tenants: { id: string; full_name: string; tenant_code: string; phone: string; houses: { house_number: string } | null } | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id?: string | null;
  read_at: string | null;
  created_at: string;
}

type FilterChip = 'all' | 'unread';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(d); msgDate.setHours(0, 0, 0, 0);
  if (msgDate.getTime() === today.getTime()) return 'Today';
  if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function avatarColor(name: string): string {
  const colors = [
    'from-emerald-600 to-emerald-700',
    'from-teal-600 to-teal-700',
    'from-green-600 to-green-700',
    'from-cyan-700 to-cyan-800',
    'from-slate-600 to-slate-700',
    'from-slate-500 to-slate-600',
  ];
  const hash = (name || '?').charCodeAt(0) || 0;
  return colors[hash % colors.length];
}

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name?.[0]?.toUpperCase() ?? '?';
}

export default function AdminChatPage() {
  const { user } = useAuth();
  const { t } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const readUpdatesInFlight = useRef(new Set<string>());

  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, tenant_id, updated_at, tenants(id, full_name, tenant_code, phone, houses(house_number))')
      .order('updated_at', { ascending: false });
    if (error) { addToast(error.message, 'error'); return; }
    const normalized = (data ?? []).map(c => ({
      ...c,
      tenants: Array.isArray(c.tenants)
        ? c.tenants[0]
          ? {
              ...c.tenants[0],
              houses: Array.isArray(c.tenants[0].houses) ? c.tenants[0].houses[0] ?? null : c.tenants[0].houses,
            }
          : null
        : c.tenants,
    }));
    setConversations(normalized as Conversation[]);
    setLoading(false);
  }, [addToast]);

  // Load unread counts for ALL conversations from the database
  const loadUnreadCounts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('conversation_id, id')
      .is('read_at', null)
      .neq('sender_id', user.id);
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    const map: Record<string, number> = {};
    (data ?? []).forEach(m => {
      map[m.conversation_id] = (map[m.conversation_id] ?? 0) + 1;
    });
    setUnreadMap(map);
  }, [user, addToast]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadUnreadCounts(); }, [loadUnreadCounts]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-conv-list')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => loadConversations())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => loadUnreadCounts())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        () => loadUnreadCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversations, loadUnreadCounts]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setMessages([]);
    supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) addToast(error.message, 'error');
        else setMessages(data ?? []);
      });
    return () => { cancelled = true; };
  }, [activeId, addToast]);

  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`admin-chat-${activeId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as ChatMessage];
          });
          loadConversations();
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as ChatMessage : m));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadConversations]);

  useEffect(() => {
    if (!activeId || !user) return;
    const unread = messages.filter(m =>
      m.sender_id !== user.id && !m.read_at && !readUpdatesInFlight.current.has(m.id)
    );
    if (unread.length === 0) return;
    const messageIds = unread.map(message => message.id);
    messageIds.forEach(id => readUpdatesInFlight.current.add(id));

    void (async () => {
      const readAt = new Date().toISOString();
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .update({ read_at: readAt })
          .in('id', messageIds)
          .is('read_at', null)
          .select('id, read_at');
        if (error) {
          addToast(error.message, 'error');
          return;
        }

        const updated = new Map((data ?? []).map(message => [message.id, message.read_at]));
        setMessages(previous => previous.map(message => updated.has(message.id)
          ? { ...message, read_at: updated.get(message.id) ?? readAt }
          : message));
        await loadUnreadCounts();
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Unable to mark messages as read.', 'error');
      } finally {
        messageIds.forEach(id => readUpdatesInFlight.current.delete(id));
      }
    })();
  }, [messages, activeId, user, addToast, loadUnreadCounts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !activeId || !user || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: activeId,
        sender_id: user.id,
        body,
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      });
      if (error) {
        addToast(replyTo && error.message.includes('reply_to_id')
          ? t('chatReplyMigrationRequired')
          : error.message, 'error');
      } else {
        setInput('');
        setReplyTo(null);
        setShowEmoji(false);
        await loadConversations();
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : t('messageSendFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async () => {
    if (!activeId || deletingConversation) return;
    setDeletingConversation(true);
    const conversationId = activeId;
    const { error } = await supabase.from('chat_conversations').delete().eq('id', conversationId);
    if (error) {
      addToast(error.message, 'error');
    } else {
      setConversations(previous => previous.filter(conversation => conversation.id !== conversationId));
      setUnreadMap(previous => {
        const next = { ...previous };
        delete next[conversationId];
        return next;
      });
      setMessages([]);
      setActiveId(null);
      setReplyTo(null);
      setInput('');
      setShowEmoji(false);
      setMobileView('list');
      setConfirmDeleteConversation(false);
      addToast(t('conversationDeleted'), 'success');
    }
    setDeletingConversation(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCopy = (msg: ChatMessage) => {
    navigator.clipboard?.writeText(msg.body);
    addToast('Message copied', 'success');
  };

  const handleDelete = async (msg: ChatMessage) => {
    const { error } = await supabase.from('chat_messages').delete().eq('id', msg.id);
    if (error) addToast(error.message, 'error');
    else { setMessages(prev => prev.filter(m => m.id !== msg.id)); addToast('Message deleted', 'success'); }
  };

  const unreadCount = useCallback((convId: string) => {
    return unreadMap[convId] ?? 0;
  }, [unreadMap]);

  const unreadTotal = useMemo(() =>
    Object.values(unreadMap).reduce((sum, n) => sum + n, 0),
  [unreadMap]);

  const lastMessageFor = useCallback((convId: string) => {
    return messages.filter(m => m.conversation_id === convId).slice(-1)[0];
  }, [messages]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (search) {
      list = list.filter(c => {
        const name = c.tenants?.full_name ?? '';
        return name.toLowerCase().includes(search.toLowerCase()) ||
          (c.tenants?.tenant_code ?? '').toLowerCase().includes(search.toLowerCase());
      });
    }
    if (filter === 'unread') {
      list = list.filter(c => unreadCount(c.id) > 0);
    }
    return list;
  }, [conversations, search, filter, unreadCount]);

  const activeConv = conversations.find(c => c.id === activeId);
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';
    messages.forEach(m => {
      const label = getDateLabel(m.created_at);
      if (label !== currentDate) {
        groups.push({ date: label, messages: [m] });
        currentDate = label;
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }, [messages]);

  const emojis = ['😀','😂','😊','😍','🤔','👍','👎','🙏','👏','🔥','💯','✅','❤️','🎉',' 😅','🤝','👋'];

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('callCenter')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('chatWithAdmin')}</p>
      </div>

      <div
        className="flex overflow-hidden"
        style={{
          background: '#ffffff',
          border: '1px solid #e9ecef',
          borderRadius: '1.125rem',
          height: 'calc(100dvh - 250px)',
          minHeight: '420px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* ─── Conversation List ─── */}
        <div className={`flex-col border-r border-slate-200 ${mobileView === 'list' ? 'flex w-full md:w-[340px]' : 'hidden md:flex md:w-[340px]'}`}>
          {/* Search */}
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tenants..."
                className="w-full bg-slate-50 text-slate-900 text-sm rounded-xl pl-10 pr-3 py-2.5 outline-none transition-all focus:bg-white"
                style={{ border: '1px solid #e9ecef' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e9ecef'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
            {([
              { key: 'all', label: t('allConversations') },
              { key: 'unread', label: t('unread'), badge: unreadTotal },
            ] as { key: FilterChip; label: string; badge?: number }[]).map(chip => (
              <button
                key={chip.key}
                onClick={() => setFilter(chip.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  filter === chip.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
                {chip.badge !== undefined && chip.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      filter === chip.key ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {chip.badge}
                  </motion.span>
                )}
              </button>
            ))}
          </div>

          {/* Conversation items */}
          <div className="flex-1 overflow-y-auto pb-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">{t('noConversations')}</div>
            )}
            <AnimatePresence mode="popLayout">
              {filtered.map(c => {
                const isActive = c.id === activeId;
                const cnt = unreadCount(c.id);
                const lastMsg = lastMessageFor(c.id);
                const name = c.tenants?.full_name ?? 'Unknown';
                return (
                  <motion.button
                    key={c.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => {
                      setMessages([]);
                      setReplyTo(null);
                      setActiveId(c.id);
                      setMobileView('chat');
                    }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all relative ${
                      isActive ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                    style={{
                      borderLeft: isActive ? '3px solid #059669' : '3px solid transparent',
                    }}
                  >
                    {/* Avatar with online dot */}
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${avatarColor(name)} text-white text-sm font-semibold shadow-sm`}>
                        {initials(name)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {lastMsg ? timeAgo(lastMsg.created_at) : timeAgo(c.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                          <span className="font-medium text-slate-500">{c.tenants?.tenant_code ?? '—'}</span>
                          <span>·</span>
                          <span>{c.tenants?.houses?.house_number ?? '—'}</span>
                        </p>
                        {cnt > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0 bg-emerald-600 shadow-sm"
                          >
                            {cnt}
                          </motion.span>
                        )}
                      </div>
                      {lastMsg && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {lastMsg.sender_id === user?.id ? 'You: ' : ''}{lastMsg.body}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ─── Chat Panel ─── */}
        <div className={`flex-1 flex-col ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
          <AnimatePresence mode="wait">
            {!activeId ? (
              /* ─── Empty State ─── */
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center h-full text-center px-8"
              >
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 bg-slate-50 border border-slate-100">
                  <MessagesSquare className="w-10 h-10 text-slate-300" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1.5">Select a conversation</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  Choose a tenant to start chatting with Administration.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={activeId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col h-full"
              >
                {/* ─── Chat Header ─── */}
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                  <button
                    onClick={() => setMobileView('list')}
                    className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${avatarColor(activeConv?.tenants?.full_name ?? '?')} text-white text-sm font-semibold shadow-sm`}>
                      {initials(activeConv?.tenants?.full_name ?? '?')}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900 font-semibold text-sm truncate">
                        {activeConv?.tenants?.full_name ?? 'Unknown'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400 font-medium">{activeConv?.tenants?.tenant_code}</span>
                      <span className="text-slate-300 text-xs">·</span>
                      <span className="text-xs text-slate-400">{activeConv?.tenants?.houses?.house_number ?? '—'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteConversation(true)}
                    aria-label={t('deleteConversation')}
                    title={t('deleteConversation')}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* ─── Messages Area ─── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1 sm:px-6" style={{ backgroundColor: '#efeae2', backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.035) 0.7px, transparent 0.7px)', backgroundSize: '14px 14px' }}>
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 bg-slate-50 border border-slate-100">
                        <MessageCircle className="w-7 h-7 text-slate-300" strokeWidth={1.5} />
                      </div>
                      <p className="text-slate-400 text-sm max-w-xs">{t('messageEmpty')}</p>
                    </div>
                  )}

                  {groupedMessages.map((group, gi) => (
                    <div key={gi}>
                      {/* Date separator */}
                      <div className="flex items-center justify-center my-4">
                        <span className="px-3 py-1 rounded-full text-[10px] font-semibold text-slate-500 bg-white border border-slate-100 shadow-sm">
                          {group.date}
                        </span>
                      </div>

                      {group.messages.map((m, mi) => {
                        const mine = m.sender_id === user?.id;
                        const prevMsg = group.messages[mi - 1];
                        const showAvatar = !mine && (!prevMsg || prevMsg.sender_id !== m.sender_id);
                        const quotedMessage = m.reply_to_id
                          ? messages.find(message => message.id === m.reply_to_id)
                          : null;
                        const isUnread = !m.read_at && m.sender_id !== user?.id;
                        const isPrevUnread = group.messages[mi - 1] && !group.messages[mi - 1].read_at && group.messages[mi - 1].sender_id !== user?.id;
                        const showUnreadDivider = isUnread && !isPrevUnread;

                        return (
                          <div key={m.id}>
                            {/* Unread divider */}
                            {showUnreadDivider && (
                              <div className="flex items-center gap-3 my-3">
                                <div className="flex-1 h-px bg-emerald-200" />
                                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Unread</span>
                                <div className="flex-1 h-px bg-emerald-200" />
                              </div>
                            )}

                            <div
                              ref={el => { messageRefs.current[m.id] = el; }}
                              onMouseEnter={() => setHoveredMsg(m.id)}
                              onMouseLeave={() => setHoveredMsg(null)}
                              className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} mb-1`}
                            >
                              {/* Incoming avatar */}
                              {!mine && showAvatar && (
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br ${avatarColor(activeConv?.tenants?.full_name ?? '?')} text-white text-[10px] font-semibold shrink-0 mb-0.5`}>
                                  {initials(activeConv?.tenants?.full_name ?? '?')}
                                </div>
                              )}
                              {!mine && !showAvatar && <div className="w-7 shrink-0" />}

                              {/* Message bubble */}
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`group relative max-w-[75%] sm:max-w-[65%] px-4 py-2.5 ${
                                  mine
                                    ? 'bg-[#d9fdd3] text-slate-800 rounded-2xl rounded-br-md'
                                    : 'bg-white text-slate-800 rounded-2xl rounded-bl-md'
                                }`}
                                style={{
                                  boxShadow: mine
                                    ? '0 1px 2px rgba(15,23,42,0.08)'
                                    : '0 1px 2px rgba(0,0,0,0.04)',
                                  border: mine ? 'none' : '1px solid #e9ecef',
                                }}
                              >
                                {m.reply_to_id && (
                                  <div className={`mb-2 rounded-md border-l-[3px] px-2 py-1 text-[10px] ${mine ? 'border-emerald-800/50 bg-emerald-100/70 text-slate-600' : 'border-emerald-600 bg-slate-50 text-slate-600'}`}>
                                    <p className="font-semibold">{t('replyingTo')}</p>
                                    <p className="truncate">{quotedMessage?.body ?? t('originalMessageUnavailable')}</p>
                                  </div>
                                )}

                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>

                                {/* Timestamp + read status */}
                                <div className={`flex items-center gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                                  <span className="text-[10px] text-slate-500">
                                    {formatTime(m.created_at)}
                                  </span>
                                  {mine && (
                                    <span className={m.read_at ? 'text-sky-600' : 'text-slate-400'}>
                                      <CheckCheck className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setReplyTo(m)}
                                    title={t('reply')}
                                    aria-label={t('reply')}
                                    className="ml-1 rounded p-0.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                                  >
                                    <Reply className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Hover actions */}
                                <AnimatePresence>
                                  {hoveredMsg === m.id && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 5 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: 5 }}
                                      transition={{ duration: 0.15 }}
                                      className={`absolute ${mine ? 'left-0 -bottom-9' : 'right-0 -bottom-9'} flex items-center gap-1 px-1.5 py-1 rounded-xl bg-white border border-slate-100 shadow-md`}
                                    >
                                      <button
                                        onClick={() => handleCopy(m)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Copy"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      {mine && (
                                        <button
                                          onClick={() => handleDelete(m)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <div ref={bottomRef} />
                </div>

                {/* ─── Reply Preview Bar ─── */}
                <AnimatePresence>
                  {replyTo && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 sm:px-6 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-3"
                    >
                      <Reply className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-slate-500">{t('replyingTo')}</p>
                        <p className="text-xs text-slate-600 truncate">{replyTo.body}</p>
                      </div>
                      <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ─── Emoji Picker ─── */}
                <AnimatePresence>
                  {showEmoji && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="px-4 py-3 flex flex-wrap gap-1 bg-slate-50">
                        {emojis.map((e, i) => (
                          <button
                            key={i}
                            onClick={() => { setInput(v => v + e); setShowEmoji(false); }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white transition-colors text-lg"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ─── Message Input ─── */}
                <div className="px-3 sm:px-4 py-3 border-t border-slate-100 bg-white">
                  <div className="flex items-end gap-2">
                    {/* Emoji button */}
                    <button
                      onClick={() => setShowEmoji(o => !o)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        showEmoji ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Text input */}
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder={t('typeMessage')}
                      rows={1}
                      maxLength={4000}
                      className="flex-1 bg-slate-50 text-slate-900 text-sm rounded-2xl px-4 py-2.5 resize-none outline-none transition-all max-h-32"
                      style={{ border: '1px solid #e9ecef', minHeight: '42px' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e9ecef'; e.currentTarget.style.boxShadow = 'none'; }}
                    />

                    {/* Send button */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleSend}
                      disabled={sending || !input.trim() || !activeId}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: input.trim() ? '#128c7e' : '#a7cfc8',
                        boxShadow: input.trim() ? '0 2px 8px rgba(18,140,126,0.25)' : 'none',
                      }}
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Modal
        open={confirmDeleteConversation}
        onClose={() => setConfirmDeleteConversation(false)}
        title={t('deleteConversation')}
        size="sm"
      >
        <p className="text-sm text-slate-600">{t('deleteConversationConfirm')}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmDeleteConversation(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={deleteConversation}
            disabled={deletingConversation}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deletingConversation ? t('deleting') : t('delete')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
