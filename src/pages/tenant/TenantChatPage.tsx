import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Reply, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { useChatPresence } from '@/hooks/useChatPresence';
import WhatsAppIcon from '@/components/ui/WhatsAppIcon';
import { Select } from '@/components/ui/Input';

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id?: string | null;
  read_at: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  conversation_type: 'tenant_admin' | 'manager_tenant';
  manager_id: string | null;
  managers: { id: string; full_name: string; profile_photo_path: string | null; photoUrl?: string } | null;
}

interface AssignedManager {
  manager_id: string;
  full_name: string;
  profile_photo_path: string | null;
}

const tenantConversationCache = new Map<string, { tenantId: string; conversations: Conversation[] }>();
const tenantMessageCache = new Map<string, ChatMessage[]>();

function dateLabel(iso: string, language: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
  if (sameDay(date, today)) return language === 'fr' ? "Aujourd'hui" : 'Today';
  if (sameDay(date, yesterday)) return language === 'fr' ? 'Hier' : 'Yesterday';
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function formatChatTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const time = formatChatTime(iso, language);
  if (seenDay.getTime() === today.getTime()) return `${t('presenceLastSeenToday')} ${time}`;
  if (seenDay.getTime() === yesterday.getTime()) return `${t('presenceLastSeenYesterday')} ${time}`;
  const date = seenAt.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: seenAt.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return `${t('presenceLastSeenAt')} ${date}, ${time}`;
}

export default function TenantChatPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user, profile, tenantRecord } = useAuth();
  const { t, language, appLogoUrl } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const reportPresenceError = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  const cachedConversation = user?.id ? tenantConversationCache.get(user.id) : undefined;
  const cachedInitialConversationId = cachedConversation?.conversations.find(item => item.conversation_type === 'tenant_admin')?.id
    ?? cachedConversation?.conversations[0]?.id
    ?? null;
  const [conversationId, setConversationId] = useState<string | null>(cachedInitialConversationId);
  const [tenantId, setTenantId] = useState<string | null>(cachedConversation?.tenantId ?? tenantRecord?.id ?? null);
  const [conversations, setConversations] = useState<Conversation[]>(() => cachedConversation?.conversations ?? []);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    user?.id && cachedInitialConversationId
      ? tenantMessageCache.get(`${user.id}:${cachedInitialConversationId}`) ?? []
      : [],
  );
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(() => !cachedConversation);
  const tenantPhotoUrl = tenantRecord?.photo_url ?? undefined;
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | undefined>(tenantPhotoUrl);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrolledMessageId = useRef<string | null>(null);
  const readUpdatesInFlight = useRef(new Set<string>());
  const conversationCacheReady = useRef(Boolean(cachedConversation));
  const lastTenantCacheKey = useRef(user?.id ?? '');
  const skipTenantCacheWrite = useRef(false);
  const chatPresence = useChatPresence(conversationId, user?.id, reportPresenceError);
  const peerPresence = chatPresence
    .filter(participant => participant.user_id !== user?.id)
    .find(participant =>
      participant.chat_last_seen_at
      && Date.now() - new Date(participant.chat_last_seen_at).getTime() < 90_000
    ) ?? chatPresence
      .filter(participant => participant.user_id !== user?.id)
      .reduce<typeof chatPresence[number] | undefined>((latest, participant) => {
        if (!participant.chat_last_seen_at) return latest;
        if (!latest?.chat_last_seen_at) return participant;
        return new Date(participant.chat_last_seen_at).getTime() > new Date(latest.chat_last_seen_at).getTime()
          ? participant
          : latest;
      }, undefined);
  const peerIsOnline = Boolean(
    peerPresence?.chat_last_seen_at
    && Date.now() - new Date(peerPresence.chat_last_seen_at).getTime() < 90_000
  );
  const activePresenceLabel = presenceLabel(peerPresence?.chat_last_seen_at, language, t);

  useEffect(() => {
    setMyPhotoUrl(tenantPhotoUrl);
  }, [tenantPhotoUrl]);

  useEffect(() => {
    if (!user?.id) return;
    if (lastTenantCacheKey.current !== user.id) {
      lastTenantCacheKey.current = user.id;
      skipTenantCacheWrite.current = true;
    }
    const cached = tenantConversationCache.get(user.id);
    if (!cached) {
      conversationCacheReady.current = false;
      setTenantId(tenantRecord?.id ?? null);
      setConversationId(null);
      setConversations([]);
      setMessages([]);
      setLoading(true);
      return;
    }
    conversationCacheReady.current = true;
    const cachedId = cached.conversations.find(item => item.conversation_type === 'tenant_admin')?.id
      ?? cached.conversations[0]?.id
      ?? null;
    setTenantId(cached.tenantId);
    setConversationId(cachedId);
    setConversations(cached.conversations);
    setMessages(cachedId ? tenantMessageCache.get(`${user.id}:${cachedId}`) ?? [] : []);
    setLoading(false);
  }, [user?.id, tenantRecord?.id]);

  const loadConversation = useCallback(async () => {
    if (!user || profile?.role !== 'tenant') return;

    const tenantLookup = tenantRecord?.id
      ? Promise.resolve({ data: { id: tenantRecord.id }, error: null })
      : supabase.from('tenants').select('id').eq('user_id', user.id).maybeSingle();
    const [tenantResult, managersResult] = await Promise.all([
      tenantLookup,
      supabase.rpc('get_tenant_property_managers'),
    ]);
    const { data: tenant, error: tenantError } = tenantResult;
    if (tenantError) {
      addToast(tenantError.message, 'error');
      return;
    }
    if (!tenant) return;
    setTenantId(tenant.id);

    const { data: managers, error: managersError } = managersResult;
    if (managersError) {
      addToast(managersError.message, 'error');
    }
    const managerListWithPaths: AssignedManager[] = managers ?? [];

    const { data: existing, error: conversationError } = await supabase
      .from('chat_conversations')
      .select('id, conversation_type, manager_id')
      .eq('tenant_id', tenant.id)
      .in('conversation_type', ['tenant_admin', 'manager_tenant'])
      .order('updated_at', { ascending: false });
    if (conversationError) {
      addToast(conversationError.message, 'error');
      return;
    }
    const managerList = managerListWithPaths.map(manager => ({ ...manager, photoUrl: undefined }));
    const normalized = (existing ?? []).map(conversation => {
      const manager = managerList.find(item => item.manager_id === conversation.manager_id);
      return {
        id: conversation.id,
        conversation_type: conversation.conversation_type as Conversation['conversation_type'],
        manager_id: conversation.manager_id,
        managers: manager ? {
          id: manager.manager_id,
          full_name: manager.full_name,
          profile_photo_path: manager.profile_photo_path,
          photoUrl: manager.photoUrl,
        } : null,
      };
    });
    conversationCacheReady.current = true;
    tenantConversationCache.set(user.id, { tenantId: tenant.id, conversations: normalized });
    setConversations(normalized);
    const adminConversation = normalized.find(conversation => conversation.conversation_type === 'tenant_admin');
    setConversationId(current => current && normalized.some(conversation => conversation.id === current)
      ? current
      : adminConversation?.id ?? normalized[0]?.id ?? null);

    const managerPhotoPaths = [...new Set(managerListWithPaths
      .map(manager => manager.profile_photo_path)
      .filter((path): path is string => Boolean(path)))];
    if (managerPhotoPaths.length > 0) {
      void supabase.storage
        .from('identity-documents')
        .createSignedUrls(managerPhotoPaths, 3600)
        .then(({ data: signedPhotos, error: photoError }) => {
          if (photoError) {
            addToast(photoError.message, 'error');
            return;
          }
          const managerPhotoUrls = new Map<string, string>();
          (signedPhotos ?? []).forEach(photo => {
            if (photo.path && photo.signedUrl) managerPhotoUrls.set(photo.path, photo.signedUrl);
          });
          setConversations(previous => {
            const updated = previous.map(conversation => {
              const manager = conversation.managers;
              if (!manager?.profile_photo_path) return conversation;
              const photoUrl = managerPhotoUrls.get(manager.profile_photo_path);
              return photoUrl ? { ...conversation, managers: { ...manager, photoUrl } } : conversation;
            });
            tenantConversationCache.set(user.id, { tenantId: tenant.id, conversations: updated });
            return updated;
          });
        })
        .catch((error: unknown) => addToast(
          error instanceof Error ? error.message : 'Unable to load manager profile photos.',
          'error',
        ));
    }
  }, [user, profile, tenantRecord?.id, addToast]);

  useEffect(() => {
    if (profile?.role !== 'tenant') return;
    conversationCacheReady.current = Boolean(user?.id && tenantConversationCache.has(user.id));
    if (conversationCacheReady.current) setLoading(false);
    void loadConversation()
      .catch((error: unknown) => addToast(
        error instanceof Error ? error.message : 'Unable to load conversations.',
        'error',
      ))
      .finally(() => setLoading(false));
  }, [profile, user?.id, loadConversation, addToast]);

  useEffect(() => {
    if (skipTenantCacheWrite.current) {
      skipTenantCacheWrite.current = false;
      return;
    }
    if (!user?.id || !tenantId || !conversationCacheReady.current) return;
    tenantConversationCache.set(user.id, { tenantId, conversations });
  }, [user?.id, tenantId, conversations]);

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    tenantMessageCache.set(`${user.id}:${conversationId}`, messages);
  }, [user?.id, conversationId, messages]);

  const startConversation = async () => {
    if (!tenantId || !user || sending) return;
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ tenant_id: tenantId, conversation_type: 'tenant_admin' })
      .select('id')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        await loadConversation();
      } else {
        addToast(error.message, 'error');
      }
      return;
    }
    setMessages([]);
    if (data?.id) {
      const newConversation: Conversation = {
        id: data.id,
        conversation_type: 'tenant_admin',
        manager_id: null,
        managers: null,
      };
      setConversations(current => [...current.filter(item => item.id !== data.id), newConversation]);
    }
    setConversationId(data?.id ?? null);
  };

  const activeConversation = conversations.find(conversation => conversation.id === conversationId);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`tenant-chat-list-${tenantId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_conversations', filter: `tenant_id=eq.${tenantId}` },
        () => { void loadConversation(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tenantId, loadConversation]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const cacheKey = `${user?.id}:${conversationId}`;
    setMessages(tenantMessageCache.get(cacheKey) ?? []);
    supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) addToast(error.message, 'error');
        else {
          setMessages(previous => {
            const merged = new Map((data ?? []).map(message => [message.id, message as ChatMessage]));
            previous.forEach(message => merged.set(message.id, message));
            const next = [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
            tenantMessageCache.set(cacheKey, next);
            return next;
          });
        }
      });
    return () => { cancelled = true; };
  }, [conversationId, user?.id, addToast]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          setMessages(previous => previous.some(message => message.id === payload.new.id)
            ? previous
            : [...previous, payload.new as ChatMessage]);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          setMessages(previous => previous.map(message => message.id === payload.new.id
            ? payload.new as ChatMessage
            : message));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`tenant-chat-conversation-${tenantId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_conversations' },
        payload => {
          const deletedId = payload.old.id;
          setConversations(previous => previous.filter(conversation => conversation.id !== deletedId));
          if (conversationId === deletedId) {
            setConversationId(null);
            setMessages([]);
            setReplyTo(null);
            void loadConversation();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, conversationId, loadConversation]);

  useEffect(() => {
    if (!conversationId || !user) return;
    const unread = messages.filter(message =>
      message.sender_id !== user.id
      && !message.read_at
      && !readUpdatesInFlight.current.has(message.id)
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
      } catch (error) {
        addToast(error instanceof Error ? error.message : t('chatMessageReadError'), 'error');
      } finally {
        messageIds.forEach(id => readUpdatesInFlight.current.delete(id));
      }
    })();
  }, [messages, conversationId, user, addToast, t]);

  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) {
      lastScrolledMessageId.current = null;
      return;
    }
    if (lastScrolledMessageId.current === lastMessageId) return;
    lastScrolledMessageId.current = lastMessageId;
    const scroller = bottomRef.current?.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [conversationId, lastMessageId]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !conversationId || !user || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      });
      if (error) {
        if (error.code === '23503') {
          setConversationId(null);
          setMessages([]);
          setReplyTo(null);
          addToast(t('conversationCleared'), 'error');
        } else {
          addToast(replyTo && error.message.includes('reply_to_id')
            ? t('chatReplyMigrationRequired')
            : error.message, 'error');
        }
      } else {
        setInput('');
        setReplyTo(null);
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : t('messageSendFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#25D366]">
          <WhatsAppIcon className="h-7 w-7 text-[#25D366]" />
          {t('chatCenter')}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{activeConversation?.conversation_type === 'manager_tenant'
          ? `${t('chatWith')} ${activeConversation.managers?.full_name ?? t('propertyManager')}`
          : t('chatWithAdmin')}</p>
      </div>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111b21]/75 shadow-2xl backdrop-blur-2xl" style={{ height: 'calc(100dvh - 190px)', boxShadow: '0 24px 70px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
        <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#111b21]/65 px-4 py-3 backdrop-blur-2xl sm:px-5">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 p-2">
            {activeConversation?.conversation_type === 'manager_tenant'
              ? activeConversation.managers?.photoUrl
                ? <img src={activeConversation.managers.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
                : <img src={appLogoUrl} alt="" className="h-5 w-5 object-contain" />
              : <WhatsAppIcon className="h-full w-full text-white" />}
            {activePresenceLabel === t('online') && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            {conversations.length > 1 ? (
              <Select
                value={conversationId ?? ''}
                onChange={event => {
                  setConversationId(event.target.value);
                  setReplyTo(null);
                  setMessages([]);
                }}
                aria-label={t('selectConversation')}
                className="chat-conversation-select max-w-full truncate text-sm font-semibold text-white outline-none"
                style={{
                  width: 'auto',
                  maxWidth: '100%',
                  minWidth: 0,
                  minHeight: 'auto',
                  border: 0,
                  padding: 0,
                  background: 'transparent',
                  color: '#ffffff',
                  boxShadow: 'none',
                  backdropFilter: 'none',
                }}
              >
                {conversations.map(conversation => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.conversation_type === 'manager_tenant'
                      ? `${t('propertyManager')}: ${conversation.managers?.full_name ?? ''}`
                      : t('adminSupport')}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="truncate text-sm font-semibold text-white">
                {activeConversation?.conversation_type === 'manager_tenant'
                  ? activeConversation.managers?.full_name ?? t('propertyManager')
                  : t('adminSupport')}
              </p>
            )}
            <p className={`truncate text-xs ${activePresenceLabel === t('online') ? 'text-emerald-400' : 'text-slate-400'}`}>
              {activePresenceLabel}
            </p>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5"
          style={{ backgroundColor: '#0b141a', backgroundImage: "url('/chat-wallpaper.png')", backgroundSize: '420px auto', backgroundPosition: 'center top', backgroundRepeat: 'repeat' }}
        >
          {!conversationId ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#25D366] shadow-sm">
                <WhatsAppIcon className="h-8 w-8" />
              </div>
              <p className="mb-4 max-w-xs rounded-xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                {t('conversationCleared')}
              </p>
              <button
                type="button"
                onClick={startConversation}
                className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1DA851]"
              >
                {t('startConversation')}
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#25D366] shadow-sm">
                <WhatsAppIcon className="h-8 w-8" />
              </div>
              <p className="max-w-xs rounded-xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">{t('messageEmpty')}</p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
              {messages.map((message, index) => {
                const mine = message.sender_id === user?.id;
                const previous = messages[index - 1];
                const showAvatar = true;
                const senderPhotoUrl = mine
                  ? myPhotoUrl
                  : conversations.find(conversation => conversation.id === conversationId)?.managers?.photoUrl;
                const quotedMessage = message.reply_to_id
                  ? messages.find(item => item.id === message.reply_to_id)
                  : null;
                const showDate = !previous
                  || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return (
                  <React.Fragment key={message.id}>
                    {showDate && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                          {dateLabel(message.created_at, language)}
                        </span>
                      </div>
                    )}
                    <div className={`mb-0.5 flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {!mine && (
                        showAvatar
                          ? <div className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${senderPhotoUrl ? 'bg-slate-100' : 'bg-black'}`}>
                              {senderPhotoUrl
                                ? <img src={senderPhotoUrl} alt="" className="h-full w-full object-cover" />
                                : <UserRound className="h-3.5 w-3.5 text-white" />}
                            </div>
                          : <div className="w-6 shrink-0" />
                      )}
                      <div className={`whatsapp-chat-bubble max-w-[78%] rounded-[12px] px-2.5 py-1 shadow-sm sm:max-w-[65%] ${mine ? 'whatsapp-chat-outgoing rounded-br-[4px]' : 'whatsapp-chat-incoming rounded-bl-[4px]'}`}>
                        {message.reply_to_id && (
                          <div className={`whatsapp-chat-quote mb-2 rounded-md border-l-[3px] px-2 py-1 text-[10px] ${mine ? 'border-emerald-800/50' : 'border-emerald-600'}`}>
                            <p className="font-semibold" style={{ color: '#111827' }}>{t('replyingTo')}</p>
                            <p className="truncate font-semibold" style={{ color: '#111827' }}>{quotedMessage?.body ?? t('originalMessageUnavailable')}</p>
                          </div>
                        )}
                        <p className="whatsapp-chat-message whitespace-pre-wrap break-words text-[13px] leading-[1.3]" style={mine ? { fontWeight: 700 } : undefined}>{message.body}</p>
                        <div className="whatsapp-chat-meta mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => setReplyTo(message)}
                            title={t('reply')}
                            aria-label={t('reply')}
                            className="mr-1 rounded p-0.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                            style={mine ? { color: '#111827' } : undefined}
                          >
                            <Reply className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          <time dateTime={message.created_at} style={mine ? { color: '#111827', fontWeight: 700 } : undefined}>
                            {formatChatTime(message.created_at, language)}
                          </time>
                          {mine && (
                            message.read_at
                              ? <CheckCheck className="h-3.5 w-3.5 text-sky-600" style={{ color: '#0284c7' }} strokeWidth={2.5} />
                              : peerIsOnline
                                ? <CheckCheck className="h-3.5 w-3.5" style={{ color: '#111827' }} strokeWidth={2.5} />
                                : <Check className="h-3.5 w-3.5" style={{ color: '#111827' }} strokeWidth={2.5} />
                          )}
                        </div>
                      </div>
                      {mine && (
                        showAvatar
                          ? <div className={`mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${senderPhotoUrl ? 'bg-slate-100' : 'bg-black'}`}>
                              {senderPhotoUrl
                                ? <img src={senderPhotoUrl} alt="" className="h-full w-full object-cover" />
                                : <UserRound className="h-3.5 w-3.5 text-white" />}
                            </div>
                          : <div className="w-6 shrink-0" />
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {conversationId && (
          <footer className="whatsapp-chat-composer relative z-10 shrink-0 border-t border-white/10 bg-[#111b21]/65 p-2.5 backdrop-blur-2xl sm:px-4 sm:py-3">
            {replyTo && (
              <div className="whatsapp-chat-reply-preview mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border-l-4 border-emerald-600 bg-[#202c33] px-3 py-2">
                <Reply className="h-4 w-4 shrink-0 text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-emerald-700">{t('replyingTo')}</p>
                  <p className="truncate text-xs text-slate-200">{replyTo.body}</p>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} aria-label={t('cancelReply')} className="rounded p-1 text-slate-400 hover:bg-[#34434a] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKey}
              placeholder={t('typeMessage')}
              rows={1}
              maxLength={4000}
              className="whatsapp-chat-input max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400 backdrop-blur-xl focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim() || !conversationId}
              aria-label={t('send')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#1DA851] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <img src="/send.svg" alt="" className="h-4 w-4 object-contain" />
            </button>
            </div>
          </footer>
        )}
      </section>
      <button
        type="button"
        onClick={() => onNavigate('tenant-dashboard')}
        aria-label={t('tenantReturnToDashboard')}
        title={t('tenantReturnToDashboard')}
        className="mx-auto flex h-8 w-10 items-center justify-center rounded-full border border-white/20 bg-[#202c33] text-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-colors hover:bg-[#34434a] active:bg-[#111b21] md:hidden"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
