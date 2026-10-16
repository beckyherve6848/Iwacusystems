import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Send, Search, ArrowLeft, UserRound,
  Smile, CheckCheck, CheckSquare, Copy, Reply, Trash2,
  MessagesSquare, X, UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import Modal from '@/components/ui/Modal';
import { useChatPresence } from '@/hooks/useChatPresence';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';

interface Conversation {
  id: string;
  tenant_id: string | null;
  manager_id: string | null;
  conversation_type: 'tenant_admin' | 'manager_admin' | 'manager_tenant';
  updated_at: string;
  tenants: { id: string; user_id: string | null; full_name: string; tenant_code: string; phone: string; photo_url: string | null; photoUrl?: string; houses: { house_number: string } | null } | null;
  managers: { id: string; full_name: string; email: string; staff_id: string | null; profile_photo_path: string | null; photoUrl?: string } | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id?: string | null;
  read_at: string | null;
  admin_read_at?: string | null;
  created_at: string;
}

type FilterChip = 'all' | 'unread';
interface ChatContact {
  id: string;
  name: string;
  detail: string;
  kind: 'tenant' | 'manager';
}

function timeAgo(iso: string, language: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('chatNow');
  if (mins < 60) return `${mins}${t('minuteShort')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}${t('hourShort')}`;
  return new Date(iso).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB');
}

function formatTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

function presenceLabel(iso: string | null | undefined, language: string, t: (key: string) => string): string {
  if (!iso) return t('offline');
  const seenAt = new Date(iso);
  if (Date.now() - seenAt.getTime() < 90_000) return t('online');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const seenDay = new Date(seenAt.getFullYear(), seenAt.getMonth(), seenAt.getDate());
  const time = formatTime(iso, language);
  if (seenDay.getTime() === today.getTime()) return `${t('presenceLastSeenToday')} ${time}`;
  if (seenDay.getTime() === yesterday.getTime()) return `${t('presenceLastSeenYesterday')} ${time}`;
  const date = seenAt.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: seenAt.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return `${t('presenceLastSeenAt')} ${date}, ${time}`;
}

function getDateLabel(iso: string, language: string, t: (key: string) => string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(d); msgDate.setHours(0, 0, 0, 0);
  if (msgDate.getTime() === today.getTime()) return t('chatToday');
  if (msgDate.getTime() === yesterday.getTime()) return t('chatYesterday');
  return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
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

export default function AdminChatPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isPropertyManager = profile?.role === 'property_manager';
  const isCaretaker = profile?.role === 'caretaker';
  const { t, language, appLogoUrl } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const reportPresenceError = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | undefined>(profile?.photo_url);
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrolledMessageId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const readUpdatesInFlight = useRef(new Set<string>());
  const chatPresence = useChatPresence(activeId, user?.id, reportPresenceError);
  const activePresenceLabel = (() => {
    const peers = chatPresence.filter(participant => participant.user_id !== user?.id);
    const onlinePeer = peers.find(participant =>
      participant.chat_last_seen_at
      && Date.now() - new Date(participant.chat_last_seen_at).getTime() < 90_000
    );
    const lastSeenPeer = peers.reduce<typeof peers[number] | undefined>((latest, participant) => {
      if (!participant.chat_last_seen_at) return latest;
      if (!latest?.chat_last_seen_at) return participant;
      return new Date(participant.chat_last_seen_at).getTime() > new Date(latest.chat_last_seen_at).getTime()
        ? participant
        : latest;
    }, undefined);
    return presenceLabel(onlinePeer?.chat_last_seen_at ?? lastSeenPeer?.chat_last_seen_at, language, t);
  })();

  useEffect(() => {
    let active = true;
    if (profile?.photo_url) {
      setMyPhotoUrl(profile.photo_url);
      return () => { active = false; };
    }
    if (!profile?.profile_photo_path) {
      setMyPhotoUrl(undefined);
      return () => { active = false; };
    }
    supabase.storage.from('identity-documents')
      .createSignedUrl(profile.profile_photo_path, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          addToast(error.message, 'error');
          return;
        }
        setMyPhotoUrl(data.signedUrl);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        addToast(caught instanceof Error ? caught.message : 'Unable to load your chat profile photo.', 'error');
      });
    return () => { active = false; };
  }, [addToast, profile?.photo_url, profile?.profile_photo_path]);

  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, tenant_id, manager_id, conversation_type, updated_at, tenants(id, user_id, full_name, tenant_code, phone, photo_url, houses(house_number)), managers:profiles!chat_conversations_manager_id_fkey(id, full_name, email, staff_id, profile_photo_path)')
      .order('updated_at', { ascending: false });
    if (error) { addToast(error.message, 'error'); return; }
    const records = (data ?? []).map(c => ({
      ...c,
      managers: Array.isArray(c.managers) ? c.managers[0] ?? null : c.managers,
      tenants: Array.isArray(c.tenants)
        ? c.tenants[0]
          ? {
              ...c.tenants[0],
              houses: Array.isArray(c.tenants[0].houses) ? c.tenants[0].houses[0] ?? null : c.tenants[0].houses,
            }
          : null
        : c.tenants,
    }));
    const photoPaths = [...new Set(records
      .flatMap(conversation => [
        conversation.managers?.profile_photo_path,
        conversation.tenants?.photo_url?.startsWith('tenants/') ? conversation.tenants.photo_url : null,
      ])
      .filter((path): path is string => Boolean(path)))];
    const signedPhotos: Record<string, string> = {};
    if (photoPaths.length > 0) {
      const { data: signedUrls, error: photoError } = await supabase.storage
        .from('identity-documents')
        .createSignedUrls(photoPaths, 3600);
      if (photoError) addToast(photoError.message, 'error');
      (signedUrls ?? []).forEach(photo => {
        if (photo.path && photo.signedUrl) signedPhotos[photo.path] = photo.signedUrl;
      });
    }
    const normalized = records.map(conversation => ({
      ...conversation,
      managers: conversation.managers
        ? { ...conversation.managers, photoUrl: signedPhotos[conversation.managers.profile_photo_path ?? ''] }
        : null,
      tenants: conversation.tenants
        ? {
            ...conversation.tenants,
            photoUrl: conversation.tenants.photo_url?.startsWith('tenants/')
              ? signedPhotos[conversation.tenants.photo_url]
              : conversation.tenants.photo_url ?? undefined,
          }
        : null,
    }));
    setConversations(normalized as Conversation[]);
    setLoading(false);
  }, [addToast]);

  // Load unread counts for ALL conversations from the database
  const loadUnreadCounts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('conversation_id, sender_id, read_at, admin_read_at, chat_conversations(conversation_type)')
      .neq('sender_id', user.id);
    if (error) {
      addToast(error.message, 'error');
      return;
    }
    const map: Record<string, number> = {};
    (data ?? []).forEach(m => {
      const conversation = Array.isArray(m.chat_conversations) ? m.chat_conversations[0] : m.chat_conversations;
      const isUnread = conversation?.conversation_type === 'manager_tenant'
        ? !m.admin_read_at
        : !m.read_at;
      if (isUnread) map[m.conversation_id] = (map[m.conversation_id] ?? 0) + 1;
    });
    setUnreadMap(map);
  }, [user, addToast]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadUnreadCounts(); }, [loadUnreadCounts]);

  useEffect(() => {
    if (!showNewConversation) return;
    const query = contactSearch.trim();
    if (!query) {
      setContacts([]);
      setSearchingContacts(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingContacts(true);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      const tenantNameQuery = supabase.from('tenants')
        .select('id, full_name, tenant_code, phone')
        .ilike('full_name', `%${query}%`)
        .limit(10);
      const tenantCodeQuery = supabase.from('tenants')
        .select('id, full_name, tenant_code, phone')
        .ilike('tenant_code', `%${query}%`)
        .limit(10);
      const tenantQueries = [tenantNameQuery, tenantCodeQuery];
      if (isUuid) {
        tenantQueries.push(supabase.from('tenants')
          .select('id, full_name, tenant_code, phone')
          .eq('id', query)
          .limit(10));
      }
      const [tenantNameResult, tenantCodeResult, ...tenantIdResults] = await Promise.all(tenantQueries);
      const tenantIdResult = tenantIdResults[0];
      const tenantMatches = [
        ...(tenantNameResult.data ?? []),
        ...(tenantCodeResult.data ?? []),
        ...(tenantIdResult?.data ?? []),
      ];
      const tenantResultsById = new Map(
        tenantMatches.map(tenant => [tenant.id, tenant])
      );
      let results: ChatContact[] = [...tenantResultsById.values()].map(tenant => ({
        id: tenant.id,
        name: tenant.full_name,
        detail: `${tenant.tenant_code}${tenant.phone ? ` · ${tenant.phone}` : ''}`,
        kind: 'tenant',
      }));
      if (isAdmin) {
        const managerNameQuery = supabase.from('profiles')
          .select('id, full_name, email, staff_id')
          .eq('role', 'property_manager')
          .ilike('full_name', `%${query}%`)
          .limit(10);
        const managerEmailQuery = supabase.from('profiles')
          .select('id, full_name, email, staff_id')
          .eq('role', 'property_manager')
          .ilike('email', `%${query}%`)
          .limit(10);
        const managerStaffIdQuery = supabase.from('profiles')
          .select('id, full_name, email, staff_id')
          .eq('role', 'property_manager')
          .ilike('staff_id', `%${query}%`)
          .limit(10);
        const managerQueries = [managerNameQuery, managerEmailQuery, managerStaffIdQuery];
        if (isUuid) {
          managerQueries.push(supabase.from('profiles')
            .select('id, full_name, email, staff_id')
            .eq('role', 'property_manager')
            .eq('id', query)
            .limit(10));
        }
        const [managerNameResult, managerEmailResult, managerStaffIdResult, ...managerIdResults] = await Promise.all(managerQueries);
        const managerIdResult = managerIdResults[0];
        if (!cancelled) {
          [
            managerNameResult.error,
            managerEmailResult.error,
            managerStaffIdResult.error,
            managerIdResult?.error,
          ]
            .filter((error): error is NonNullable<typeof error> => Boolean(error))
            .forEach(error => addToast(error.message, 'error'));
        }
        const managersById = new Map(
          [
            ...(managerNameResult.data ?? []),
            ...(managerEmailResult.data ?? []),
            ...(managerStaffIdResult.data ?? []),
            ...(managerIdResult?.data ?? []),
          ].map(manager => [manager.id, manager])
        );
        results = results.concat([...managersById.values()].map(manager => ({
          id: manager.id,
          name: manager.full_name,
          detail: manager.staff_id ? `${manager.staff_id} · ${manager.email}` : manager.email,
          kind: 'manager' as const,
        })));
      }
      if (!cancelled) {
        [
          tenantNameResult.error,
          tenantCodeResult.error,
          tenantIdResult?.error,
        ]
          .filter((error): error is NonNullable<typeof error> => Boolean(error))
          .forEach(error => addToast(error.message, 'error'));
        setContacts(results);
        setSearchingContacts(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addToast, contactSearch, isAdmin, showNewConversation]);

  const activeConv = conversations.find(c => c.id === activeId);

  const openOrCreateConversation = async (contact: ChatContact) => {
    if (!user || creatingConversation) return;
    const conversationType = contact.kind === 'manager'
      ? 'manager_admin'
      : isAdmin ? 'tenant_admin' : 'manager_tenant';
    const lookup = supabase.from('chat_conversations')
      .select('id')
      .eq('conversation_type', conversationType);
    const existingQuery = contact.kind === 'manager'
      ? lookup.eq('manager_id', contact.id)
      : isAdmin
        ? lookup.eq('tenant_id', contact.id)
        : lookup.eq('manager_id', user.id).eq('tenant_id', contact.id);
    const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
    if (lookupError) {
      addToast(lookupError.message, 'error');
      return;
    }
    let conversationId = existing?.id;
    if (!conversationId) {
      setCreatingConversation(true);
      const { data, error } = await supabase.from('chat_conversations')
        .insert({
          conversation_type: conversationType,
          tenant_id: contact.kind === 'tenant' ? contact.id : null,
          manager_id: contact.kind === 'manager' || !isAdmin ? (contact.kind === 'manager' ? contact.id : user.id) : null,
        })
        .select('id')
        .single();
      setCreatingConversation(false);
      if (error) {
        addToast(error.message, 'error');
        return;
      }
      conversationId = data.id;
    }
    setShowNewConversation(false);
    setContactSearch('');
    setContacts([]);
    await loadConversations();
    setActiveId(conversationId);
    setMessages([]);
    setReplyTo(null);
    setMobileView('chat');
  };

  const openLandlordConversation = async () => {
    if (!user) return;
    await openOrCreateConversation({
      id: user.id,
      name: t('landlord'),
      detail: '',
      kind: 'manager',
    });
  };

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
    const channel = supabase
      .channel(`chat-${activeId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeId}` },
        payload => {
          setMessages(previous => previous.some(message => message.id === payload.new.id)
            ? previous
            : [...previous, payload.new as ChatMessage]);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeId}` },
        payload => {
          setMessages(previous => previous.map(message => message.id === payload.new.id
            ? payload.new as ChatMessage
            : message));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !user) return;
    const unreadMessages = messages.filter(message =>
      message.sender_id !== user.id
      && !(isAdmin && activeConv?.conversation_type === 'manager_tenant' ? message.admin_read_at : message.read_at)
      && !readUpdatesInFlight.current.has(message.id)
    );
    if (unreadMessages.length === 0) return;
    const markRead = async () => {
      const messageIds = unreadMessages.map(message => message.id);
      messageIds.forEach(id => readUpdatesInFlight.current.add(id));
      try {
        const readAt = new Date().toISOString();
        const update = supabase.from('chat_messages')
          .update(isAdmin && activeConv?.conversation_type === 'manager_tenant'
            ? { admin_read_at: readAt }
            : { read_at: readAt })
          .in('id', messageIds);
        const { data, error } = await update.select('id, read_at, admin_read_at');
        if (error) {
          addToast(error.message, 'error');
          return;
        }
        const updated = new Map((data ?? []).map(message => [message.id,
          isAdmin && activeConv?.conversation_type === 'manager_tenant'
            ? message.admin_read_at
            : message.read_at]));
        setMessages(previous => previous.map(message => updated.has(message.id)
          ? isAdmin && activeConv?.conversation_type === 'manager_tenant'
            ? { ...message, admin_read_at: updated.get(message.id) ?? readAt }
            : { ...message, read_at: updated.get(message.id) ?? readAt }
          : message));
        await loadUnreadCounts();
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Unable to mark messages as read.', 'error');
      } finally {
        messageIds.forEach(id => readUpdatesInFlight.current.delete(id));
      }
    };
    void markRead();
  }, [messages, activeId, activeConv?.conversation_type, isAdmin, user, addToast, loadUnreadCounts]);

  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) {
      lastScrolledMessageId.current = null;
      return;
    }
    if (lastScrolledMessageId.current === lastMessageId) return;
    lastScrolledMessageId.current = lastMessageId;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, lastMessageId]);

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
    const conversationIds = selectionMode
      ? selectedConversationIds
      : activeId ? [activeId] : [];
    if (!isAdmin || conversationIds.length === 0 || deletingConversation) return;
    setDeletingConversation(true);
    try {
      const { error } = await supabase
        .from('chat_conversations')
        .delete()
        .in('id', conversationIds);
      if (error) {
        addToast(error.message, 'error');
        return;
      }
      setConversations(previous => previous.filter(conversation => !conversationIds.includes(conversation.id)));
      setUnreadMap(previous => {
        const next = { ...previous };
        conversationIds.forEach(id => delete next[id]);
        return next;
      });
      if (activeId && conversationIds.includes(activeId)) {
        setMessages([]);
        setActiveId(null);
        setReplyTo(null);
        setInput('');
        setShowEmoji(false);
        setMobileView('list');
      }
      setSelectedConversationIds([]);
      setSelectionMode(false);
      setConfirmDeleteConversation(false);
      addToast(conversationIds.length === 1 ? t('conversationDeleted') : t('conversationsDeleted'), 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : t('conversationDeleteFailed'), 'error');
    } finally {
      setDeletingConversation(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCopy = (msg: ChatMessage) => {
    navigator.clipboard?.writeText(msg.body);
    addToast(t('messageCopied'), 'success');
  };

  const handleDelete = async (msg: ChatMessage) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('chat_messages').delete().eq('id', msg.id);
    if (error) addToast(error.message, 'error');
    else { setMessages(prev => prev.filter(m => m.id !== msg.id)); addToast(t('messageDeleted'), 'success'); }
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
    if (filter === 'unread') {
      list = list.filter(c => unreadCount(c.id) > 0);
    }
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      list = list.filter(conversation => [
        conversation.id,
        conversation.tenant_id,
        conversation.manager_id,
        conversation.tenants?.id,
        conversation.tenants?.user_id,
        conversation.tenants?.full_name,
        conversation.tenants?.tenant_code,
        conversation.tenants?.phone,
        conversation.tenants?.houses?.house_number,
        conversation.managers?.id,
        conversation.managers?.full_name,
        conversation.managers?.email,
        conversation.managers?.staff_id,
      ].some(value => value?.toLowerCase().includes(normalizedSearch)));
    }
    return list;
  }, [conversations, search, filter, unreadCount]);

  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';
    messages.forEach(m => {
      const label = getDateLabel(m.created_at, language, t);
      if (label !== currentDate) {
        groups.push({ date: label, messages: [m] });
        currentDate = label;
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }, [messages, language, t]);

  const emojis = ['😀','😂','😊','😍','🤔','👍','👎','🙏','👏','🔥','💯','✅','❤️','🎉',' 😅','🤝','👋'];

  return (
    <div className="min-w-0 space-y-2">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#25D366]">
          <WhatsAppIcon className="h-7 w-7 text-[#25D366]" />
          {t(isAdmin || isPropertyManager ? 'chatCenter' : 'callCenter')}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAdmin ? t('chatWithAdmin') : isCaretaker ? t('chatWithLandlord') : t('chatWithLandlordAndTenants')}
        </p>
      </div>

      <div
        className="flex min-h-0 min-w-0 overflow-hidden"
        style={{
          background: 'rgba(17, 27, 33, 0.78)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '1.125rem',
          height: 'calc(100dvh - 190px)',
          boxShadow: '0 24px 70px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
          backdropFilter: 'blur(24px) saturate(160%)',
        }}
      >
        {/* ─── Conversation List ─── */}
        <div className={`min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#111b21]/80 backdrop-blur-xl ${mobileView === 'list' ? 'flex w-full md:w-[340px] md:shrink-0' : 'hidden md:flex md:w-[340px] md:shrink-0'}`}>
          {/* Search */}
          <div className="px-4 pt-4 pb-2">
            {!isCaretaker && (
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={isAdmin ? t('searchPeopleToChat') : t('searchTenants')}
                    className="w-full rounded-xl bg-white/[0.07] py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-all placeholder:text-slate-400 focus:bg-white/[0.11]"
                    style={{ border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(16px)' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,211,102,0.12)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1 md:hidden">
                    {selectionMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteConversation(true)}
                          disabled={selectedConversationIds.length === 0}
                          aria-label={`${t('deleteSelectedConversations')} (${selectedConversationIds.length})`}
                          title={`${t('deleteSelectedConversations')} (${selectedConversationIds.length})`}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition-colors hover:bg-red-950/50 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectionMode(false);
                            setSelectedConversationIds([]);
                          }}
                          aria-label={t('cancel')}
                          title={t('cancel')}
                          className="flex h-10 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectionMode(true)}
                        aria-label={t('selectConversations')}
                        title={t('selectConversations')}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition-colors hover:bg-[#202c33] hover:text-white"
                      >
                        <CheckSquare className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {!isAdmin && (
                <button
                  type="button"
                  onClick={openLandlordConversation}
                  className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  {t('chatWithLandlord')}
                </button>
              )}
              {!isCaretaker && <button
                type="button"
                onClick={() => setShowNewConversation(open => !open)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#34434a] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#202c33]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t('startNewConversation')}
              </button>}
            </div>
            {showNewConversation && (
              <div className="mt-3 rounded-xl border border-[#34434a] bg-[#202c33] p-3">
                <input
                  autoFocus
                  value={contactSearch}
                  onChange={event => setContactSearch(event.target.value)}
                  placeholder={t('searchPeopleToChat')}
                  className="w-full rounded-lg border border-[#46545b] bg-[#111b21] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-500"
                />
                {searchingContacts && <p className="py-2 text-xs text-slate-500">{t('searchLoading')}</p>}
                <div className="mt-1 max-h-40 overflow-y-auto">
                  {contacts.map(contact => (
                    <button
                      key={`${contact.kind}-${contact.id}`}
                      type="button"
                      disabled={creatingConversation}
                      onClick={() => void openOrCreateConversation(contact)}
                      className="block w-full rounded-lg px-2 py-2 text-left hover:bg-[#26353d] disabled:opacity-50"
                    >
                      <span className="block truncate text-sm font-medium text-slate-100">{contact.name}</span>
                      <span className="block truncate text-xs text-slate-400">{contact.detail} · {contact.kind === 'tenant' ? t('tenants') : t('propertyManagers')}</span>
                    </button>
                  ))}
                  {!searchingContacts && contactSearch.trim().length > 0 && contacts.length === 0 && (
                    <p className="py-2 text-xs text-slate-500">{t('searchNoResults')}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
            {([
              { key: 'all', label: t('allConversations') },
              { key: 'unread', label: t('unreadLabel'), badge: unreadTotal },
            ] as { key: FilterChip; label: string; badge?: number }[]).map(chip => (
              <button
                key={chip.key}
                onClick={() => setFilter(chip.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  filter === chip.key
                    ? 'bg-emerald-700 text-white'
                    : 'bg-[#202c33] text-slate-300 hover:bg-[#26353d]'
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">{t('noConversations')}</div>
            )}
            <AnimatePresence mode="popLayout">
              {filtered.map(c => {
                const isActive = c.id === activeId;
                const cnt = unreadCount(c.id);
                const lastMsg = lastMessageFor(c.id);
                const isLandlordConversation = c.conversation_type === 'manager_admin' && !isAdmin;
                const isManagerAvatar = c.conversation_type === 'manager_admin' && isAdmin;
                const avatarName = isLandlordConversation
                  ? t('landlord')
                  : isManagerAvatar
                    ? c.managers?.full_name ?? t('userActivityUnknownUser')
                    : c.tenants?.full_name ?? t('userActivityUnknownUser');
                const name = avatarName;
                const avatarUrl = isManagerAvatar
                  ? c.managers?.photoUrl
                  : c.tenants?.photoUrl;
                const subtitle = c.conversation_type === 'manager_tenant'
                  ? isAdmin
                    ? `${c.managers?.full_name ?? t('propertyManager')} · ${c.tenants?.tenant_code ?? '—'}`
                    : `${c.tenants?.tenant_code ?? '—'} · ${c.tenants?.houses?.house_number ?? '—'}`
                  : c.conversation_type === 'manager_admin'
                    ? isAdmin ? t('managerConversation') : t('landlord')
                    : `${c.tenants?.tenant_code ?? '—'} · ${c.tenants?.houses?.house_number ?? '—'}`;
                return (
                  <div key={c.id} className={`flex items-center ${selectedConversationIds.includes(c.id) ? 'bg-emerald-950/30' : ''}`}>
                    {isAdmin && selectionMode && (
                      <input
                        type="checkbox"
                        checked={selectedConversationIds.includes(c.id)}
                        onChange={event => setSelectedConversationIds(previous =>
                          event.target.checked
                            ? [...previous, c.id]
                            : previous.filter(id => id !== c.id)
                        )}
                        aria-label={`${t('selectConversation')}: ${name}`}
                        className="ml-3 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                      />
                    )}
                    <motion.button
                    onClick={() => {
                      if (selectionMode && isAdmin) {
                        setSelectedConversationIds(previous => previous.includes(c.id)
                          ? previous.filter(id => id !== c.id)
                          : [...previous, c.id]);
                        return;
                      }
                      setMessages([]);
                      setReplyTo(null);
                      setActiveId(c.id);
                      setMobileView('chat');
                    }}
                    className={`relative flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-all ${
                      isActive ? 'bg-[#202c33]' : 'hover:bg-[#1b272d]'
                    }`}
                    style={{
                      borderLeft: isActive ? '3px solid #059669' : '3px solid transparent',
                    }}
                  >
                    {/* Avatar with online dot */}
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 overflow-hidden rounded-full flex items-center justify-center ${avatarUrl ? 'bg-slate-100' : `bg-gradient-to-br ${avatarColor(avatarName)}`} text-white text-sm font-semibold shadow-sm`}>
                        {avatarUrl
                          ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                          : isManagerAvatar
                            ? <img src={appLogoUrl} alt="" className="h-5 w-5 object-contain" />
                            : isLandlordConversation
                              ? <img src={appLogoUrl} alt="" className="h-5 w-5 object-contain" />
                              : <UserRound className="h-5 w-5 text-white" />}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {lastMsg ? timeAgo(lastMsg.created_at, language, t) : timeAgo(c.updated_at, language, t)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                          <span className="font-medium text-slate-400">{subtitle}</span>
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
                          {lastMsg.sender_id === user?.id ? `${t('you')}: ` : ''}{lastMsg.body}
                        </p>
                      )}
                    </div>
                    </motion.button>
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ─── Chat Panel ─── */}
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}>
          <AnimatePresence mode="wait">
            {!activeId ? (
              /* ─── Empty State ─── */
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="flex h-full min-h-0 flex-1 flex-col items-center justify-center text-center px-8"
              >
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 bg-[#202c33] border border-[#34434a]">
                <MessagesSquare className="w-10 h-10 text-slate-500" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-slate-100 mb-1.5">{t('selectChatConversation')}</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  {t('chooseTenantToChat')}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={activeId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
              >
                {/* ─── Chat Header ─── */}
                <div className="relative z-10 flex shrink-0 items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#111b21]/70 backdrop-blur-xl">
                  <div className="relative shrink-0">
                    {(() => {
                      const managerAvatar = activeConv?.conversation_type === 'manager_admin' && isAdmin;
                      const avatarName = managerAvatar
                        ? activeConv?.managers?.full_name ?? '?'
                        : activeConv?.tenants?.full_name ?? '?';
                      const avatarUrl = managerAvatar
                        ? activeConv?.managers?.photoUrl
                        : activeConv?.tenants?.photoUrl;
                      return (
                        <div className={`w-10 h-10 overflow-hidden rounded-full flex items-center justify-center ${avatarUrl ? 'bg-slate-100' : `bg-gradient-to-br ${avatarColor(avatarName)}`} text-white text-sm font-semibold shadow-sm`}>
                          {avatarUrl
                            ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                            : managerAvatar
                              ? <img src={appLogoUrl} alt="" className="h-5 w-5 object-contain" />
                              : <UserRound className="h-5 w-5 text-white" />}
                        </div>
                      );
                    })()}
                    {activePresenceLabel === t('online') && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-sm truncate">
                        {activeConv?.conversation_type === 'manager_admin'
                          ? isAdmin ? activeConv.managers?.full_name ?? t('userActivityUnknownUser') : t('landlord')
                          : activeConv?.conversation_type === 'manager_tenant' && isAdmin
                            ? `${activeConv.tenants?.full_name ?? t('userActivityUnknownUser')} · ${activeConv.managers?.full_name ?? t('propertyManager')}`
                            : activeConv?.tenants?.full_name ?? t('userActivityUnknownUser')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${activePresenceLabel === t('online') ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                      <span className={`text-xs ${activePresenceLabel === t('online') ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {activePresenceLabel}
                      </span>
                    </div>
                  </div>
                  {isAdmin && <button
                    type="button"
                    onClick={() => setConfirmDeleteConversation(true)}
                    aria-label={t('deleteConversation')}
                    title={t('deleteConversation')}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-red-950/50 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>}
                </div>

                {/* ─── Messages Area ─── */}
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-1 sm:px-6" style={{ backgroundColor: '#0b141a', backgroundImage: "url('/chat-wallpaper.png')", backgroundSize: '420px auto', backgroundPosition: 'center top', backgroundRepeat: 'repeat' }}>
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 bg-slate-50 border border-slate-100">
                        <WhatsAppIcon className="h-8 w-8 text-[#25D366]" />
                      </div>
                      <p className="text-slate-400 text-sm max-w-xs">{t('messageEmpty')}</p>
                    </div>
                  )}

                  {groupedMessages.map((group, gi) => (
                    <div key={gi}>
                      {/* Date separator */}
                      <div className="flex items-center justify-center my-4">
                        <span className="px-3 py-1 rounded-full text-[10px] font-semibold text-slate-200 bg-[#172329]/75 border border-white/15 shadow-lg backdrop-blur-xl">
                          {group.date}
                        </span>
                      </div>

                      {group.messages.map((m, mi) => {
                        const mine = m.sender_id === user?.id;
                        const showAvatar = true;
                        const senderPhotoUrl = mine
                          ? myPhotoUrl
                          : m.sender_id === activeConv?.manager_id
                            ? activeConv?.managers?.photoUrl
                            : m.sender_id === activeConv?.tenants?.user_id
                              ? activeConv?.tenants?.photoUrl
                              : undefined;
                        const isTenantSender = m.sender_id === activeConv?.tenants?.user_id;
                        const quotedMessage = m.reply_to_id
                          ? messages.find(message => message.id === m.reply_to_id)
                          : null;
                        const readAt = isAdmin && activeConv?.conversation_type === 'manager_tenant' ? m.admin_read_at : m.read_at;
                        const previousReadAt = isAdmin && activeConv?.conversation_type === 'manager_tenant' ? group.messages[mi - 1]?.admin_read_at : group.messages[mi - 1]?.read_at;
                        const isUnread = !readAt && m.sender_id !== user?.id;
                        const isPrevUnread = group.messages[mi - 1] && !previousReadAt && group.messages[mi - 1].sender_id !== user?.id;
                        const showUnreadDivider = isUnread && !isPrevUnread;

                        return (
                          <div key={m.id}>
                            {/* Unread divider */}
                            {showUnreadDivider && (
                              <div className="flex items-center gap-3 my-3">
                                <div className="flex-1 h-px bg-emerald-200" />
                                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">{t('unreadLabel')}</span>
                                <div className="flex-1 h-px bg-emerald-200" />
                              </div>
                            )}

                            <div
                              ref={el => { messageRefs.current[m.id] = el; }}
                              onMouseEnter={() => setHoveredMsg(m.id)}
                              onMouseLeave={() => setHoveredMsg(null)}
                              className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} mb-1`}
                            >
                              {!mine && (
                                showAvatar
                                  ? <div className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${senderPhotoUrl ? 'bg-slate-100' : 'bg-black'}`}>
                                      {senderPhotoUrl
                                        ? <img src={senderPhotoUrl} alt="" className="h-full w-full object-cover" />
                                        : isTenantSender
                                          ? <UserRound className="h-3.5 w-3.5 text-white" />
                                          : <img src={appLogoUrl} alt="" className="h-4 w-4 object-contain" />}
                                    </div>
                                  : <div className="w-6 shrink-0" />
                              )}

                              {/* Message bubble */}
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`group relative max-w-[78%] sm:max-w-[65%] px-2.5 py-1 ${
                                  mine
                                    ? 'bg-[#d9fdd3] text-slate-800 rounded-[12px] rounded-br-[4px]'
                                    : 'bg-white text-slate-800 rounded-[12px] rounded-bl-[4px]'
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

                                <p className="text-[13px] leading-[1.35] whitespace-pre-wrap break-words">{m.body}</p>

                                {/* Timestamp + read status */}
                                <div className={`flex items-center gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                                  <span className="text-[10px] text-slate-500">
                                    {formatTime(m.created_at, language)}
                                  </span>
                                  {mine && isAdmin && (
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
                                        title={t('copyMessage')}
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      {mine && (
                                        <button
                                          onClick={() => handleDelete(m)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title={t('delete')}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                              {mine && (
                                showAvatar
                                  ? <div className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${senderPhotoUrl ? 'bg-slate-100' : 'bg-black'}`}>
                                      {senderPhotoUrl
                                        ? <img src={senderPhotoUrl} alt="" className="h-full w-full object-cover" />
                                        : isTenantSender
                                          ? <UserRound className="h-3.5 w-3.5 text-white" />
                                          : <img src={appLogoUrl} alt="" className="h-4 w-4 object-contain" />}
                                    </div>
                                  : <div className="w-6 shrink-0" />
                              )}
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
                      className="px-4 sm:px-6 py-2 border-t border-white/10 bg-[#172329]/70 backdrop-blur-xl flex items-center gap-3"
                    >
                      <Reply className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-slate-400">{t('replyingTo')}</p>
                        <p className="text-xs text-slate-200 truncate">{replyTo.body}</p>
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
                      className="overflow-hidden border-t border-white/10"
                    >
                      <div className="px-4 py-3 flex flex-wrap gap-1 bg-[#172329]/75 backdrop-blur-xl">
                        {emojis.map((e, i) => (
                          <button
                            key={i}
                            onClick={() => { setInput(v => v + e); setShowEmoji(false); }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-lg"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ─── Message Input ─── */}
                <div className="relative z-10 px-3 sm:px-4 py-3 border-t border-white/10 bg-[#111b21]/65 backdrop-blur-2xl">
                  <div className="flex items-end gap-2">
                    {/* Emoji button */}
                    <button
                      onClick={() => setShowEmoji(o => !o)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        showEmoji ? 'text-emerald-400 bg-[#202c33]' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'
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
                      className="flex-1 bg-white/[0.08] text-white placeholder:text-slate-400 text-sm rounded-2xl px-4 py-2.5 resize-none outline-none transition-all max-h-32 backdrop-blur-xl"
                      style={{ border: '1px solid rgba(255,255,255,0.18)', minHeight: '42px' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,211,102,0.15)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
                    />

                    {/* Send button */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleSend}
                      disabled={sending || !input.trim() || !activeId}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: input.trim() ? '#25D366' : '#a8e8bd',
                        boxShadow: input.trim() ? '0 2px 8px rgba(37,211,102,0.28)' : 'none',
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
      <button
        type="button"
        onClick={() => {
          if (mobileView === 'chat') {
            setMobileView('list');
          } else {
            window.dispatchEvent(new Event('app:open-sidebar'));
          }
        }}
        aria-label={t('returnToConversations')}
        title={t('returnToConversations')}
        className="mx-auto flex h-8 w-10 items-center justify-center rounded-full border border-white/20 bg-[#202c33] text-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-colors hover:bg-[#34434a] active:bg-[#111b21] md:hidden"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <Modal
        open={confirmDeleteConversation}
        onClose={() => setConfirmDeleteConversation(false)}
        title={selectionMode && selectedConversationIds.length > 1
          ? t('deleteConversations')
          : t('deleteConversation')}
        size="sm"
      >
        <p className="text-sm text-slate-600">
          {selectionMode && selectedConversationIds.length > 1
            ? t('deleteConversationsConfirm')
            : t('deleteConversationConfirm')}
        </p>
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
