CREATE OR REPLACE FUNCTION public.protect_chat_message_read_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW.id, NEW.conversation_id, NEW.sender_id, NEW.body, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.id, OLD.conversation_id, OLD.sender_id, OLD.body, OLD.created_at) THEN
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
