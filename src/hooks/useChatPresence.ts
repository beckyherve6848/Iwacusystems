import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ChatPresence {
  user_id: string;
  chat_last_seen_at: string | null;
}

export function useChatPresence(
  conversationId: string | null,
  userId: string | undefined,
  onError: (message: string) => void,
): ChatPresence[] {
  const [participants, setParticipants] = useState<ChatPresence[]>([]);

  useEffect(() => {
    if (!conversationId || !userId) {
      setParticipants([]);
      return;
    }

    let active = true;
    const reportedErrors = new Set<string>();
    const reportError = (message: string) => {
      if (!reportedErrors.has(message)) {
        reportedErrors.add(message);
        onError(message);
      }
    };

    const refreshPresence = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { error: heartbeatError } = await supabase.rpc('update_chat_last_seen');
        if (heartbeatError) reportError(heartbeatError.message);

        const { data, error } = await supabase.rpc('get_chat_presence', {
          target_conversation_id: conversationId,
        });
        if (error) {
          reportError(error.message);
          return;
        }
        if (active) setParticipants(data ?? []);
      } catch (error) {
        reportError(error instanceof Error ? error.message : 'Unable to refresh chat presence.');
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshPresence();
    };

    void refreshPresence();
    const intervalId = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [conversationId, userId, onError]);

  return participants;
}
