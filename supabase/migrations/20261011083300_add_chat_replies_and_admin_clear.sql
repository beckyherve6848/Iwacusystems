ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid
  REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_chat_message_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.chat_messages AS replied_message
    WHERE replied_message.id = NEW.reply_to_id
      AND replied_message.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'A reply must reference a message in the same conversation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_chat_message_reply ON public.chat_messages;
CREATE TRIGGER validate_chat_message_reply
  BEFORE INSERT OR UPDATE OF reply_to_id, conversation_id ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_chat_message_reply();

CREATE OR REPLACE FUNCTION public.protect_chat_message_read_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.reply_to_id IS NOT NULL
    AND NEW.reply_to_id IS NULL
    AND NEW.read_at IS NOT DISTINCT FROM OLD.read_at
    AND ROW(NEW.id, NEW.conversation_id, NEW.sender_id, NEW.body, NEW.created_at)
      IS NOT DISTINCT FROM
        ROW(OLD.id, OLD.conversation_id, OLD.sender_id, OLD.body, OLD.created_at) THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.conversation_id, NEW.sender_id, NEW.body, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.id, OLD.conversation_id, OLD.sender_id, OLD.body, OLD.created_at)
     OR (NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id AND NEW.reply_to_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Chat message content cannot be changed';
  END IF;

  IF OLD.sender_id = (SELECT auth.uid())
    OR OLD.read_at IS NOT NULL
    OR NEW.read_at IS NULL THEN
    RAISE EXCEPTION 'Only the recipient can mark an unread message as read';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_chat_message_read_receipt ON public.chat_messages;
CREATE TRIGGER protect_chat_message_read_receipt
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_chat_message_read_receipt();

DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        JOIN public.tenants AS tenant ON tenant.id = conversation.tenant_id
        WHERE conversation.id = chat_messages.conversation_id
          AND tenant.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = (SELECT auth.uid())
          AND profile.role = 'admin'
      )
    )
  )
  WITH CHECK (
    sender_id <> (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        JOIN public.tenants AS tenant ON tenant.id = conversation.tenant_id
        WHERE conversation.id = chat_messages.conversation_id
          AND tenant.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = (SELECT auth.uid())
          AND profile.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "chat_conversations_delete" ON public.chat_conversations;
CREATE POLICY "chat_conversations_delete" ON public.chat_conversations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'admin'
    )
  );
