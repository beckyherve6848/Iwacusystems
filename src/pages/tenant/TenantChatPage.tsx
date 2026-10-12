import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCheck, MessageCircle, Reply, Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id?: string | null;
  read_at: string | null;
  created_at: string;
}

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
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export default function TenantChatPage() {
  const { user, profile } = useAuth();
  const { t, language, appName, appLogoUrl } = useTheme();
  const { toasts, addToast, removeToast } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const readUpdatesInFlight = useRef(new Set<string>());

  const loadConversation = useCallback(async () => {
    if (!user || profile?.role !== 'tenant') return;

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (tenantError) {
      addToast(tenantError.message, 'error');
      return;
    }
    if (!tenant) return;
    setTenantId(tenant.id);

    const { data: existing, error: conversationError } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (conversationError) {
      addToast(conversationError.message, 'error');
      return;
    }
    if (existing) {
      setConversationId(existing.id);
      return;
    }
  }, [user, profile, addToast]);

  useEffect(() => {
    if (profile?.role !== 'tenant') return;
    loadConversation().finally(() => setLoading(false));
  }, [profile, loadConversation]);

  const startConversation = async () => {
    if (!tenantId || !user || sending) return;
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ tenant_id: tenantId })
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
    setConversationId(data?.id ?? null);
  };

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) addToast(error.message, 'error');
        else setMessages(data ?? []);
      });
    return () => { cancelled = true; };
  }, [conversationId, addToast]);

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
        async () => {
          const { data, error } = await supabase
            .from('chat_conversations')
            .select('id')
            .eq('tenant_id', tenantId)
            .maybeSingle();
          if (error) {
            addToast(error.message, 'error');
            return;
          }
          if (!data) {
            setConversationId(null);
            setMessages([]);
            setReplyTo(null);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, addToast]);

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
        addToast(error instanceof Error ? error.message : 'Unable to mark messages as read.', 'error');
      } finally {
        messageIds.forEach(id => readUpdatesInFlight.current.delete(id));
      }
    })();
  }, [messages, conversationId, user, addToast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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
    <div className="space-y-4 sm:space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('chatCenter')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('chatWithAdmin')}</p>
      </div>

      <section className="flex h-[calc(100dvh-230px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 p-2">
            <img src={appLogoUrl} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{t('adminSupport')}</p>
            <p className="truncate text-xs text-slate-500">{appName}</p>
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5"
          style={{ backgroundColor: '#efeae2', backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.035) 0.7px, transparent 0.7px)', backgroundSize: '14px 14px' }}
        >
          {!conversationId ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
                <MessageCircle className="h-7 w-7" />
              </div>
              <p className="mb-4 max-w-xs rounded-xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                {t('conversationCleared')}
              </p>
              <button
                type="button"
                onClick={startConversation}
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
              >
                {t('startConversation')}
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
                <MessageCircle className="h-7 w-7" />
              </div>
              <p className="max-w-xs rounded-xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">{t('messageEmpty')}</p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
              {messages.map((message, index) => {
                const mine = message.sender_id === user?.id;
                const quotedMessage = message.reply_to_id
                  ? messages.find(item => item.id === message.reply_to_id)
                  : null;
                const previous = messages[index - 1];
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
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[75%] ${mine ? 'rounded-br-md bg-[#d9fdd3]' : 'rounded-bl-md bg-white'}`}>
                        {message.reply_to_id && (
                          <div className={`mb-2 rounded-md border-l-[3px] px-2 py-1 text-[10px] ${mine ? 'border-emerald-800/50 bg-emerald-100/70 text-slate-600' : 'border-emerald-600 bg-slate-50 text-slate-600'}`}>
                            <p className="font-semibold">{t('replyingTo')}</p>
                            <p className="truncate">{quotedMessage?.body ?? t('originalMessageUnavailable')}</p>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{message.body}</p>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => setReplyTo(message)}
                            title={t('reply')}
                            aria-label={t('reply')}
                            className="mr-1 rounded p-0.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          <time dateTime={message.created_at}>
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </time>
                          {mine && <CheckCheck className={`h-3.5 w-3.5 ${message.read_at ? 'text-sky-600' : 'text-slate-400'}`} />}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {conversationId && (
          <footer className="border-t border-slate-200 bg-[#f0f2f5] p-2.5 sm:px-4 sm:py-3">
            {replyTo && (
              <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border-l-4 border-emerald-600 bg-white px-3 py-2">
                <Reply className="h-4 w-4 shrink-0 text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-emerald-700">{t('replyingTo')}</p>
                  <p className="truncate text-xs text-slate-600">{replyTo.body}</p>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} aria-label={t('cancelReply')} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
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
              className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim() || !conversationId}
              aria-label={t('send')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
