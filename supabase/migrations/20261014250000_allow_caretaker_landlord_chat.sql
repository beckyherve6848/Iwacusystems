DROP POLICY IF EXISTS "caretakers_select_landlord_chat" ON public.chat_conversations;
CREATE POLICY "caretakers_select_landlord_chat" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (
    conversation_type = 'manager_admin'
    AND manager_id = (SELECT auth.uid())
    AND public.current_app_role() = 'caretaker'
  );

DROP POLICY IF EXISTS "caretakers_start_landlord_chat" ON public.chat_conversations;
CREATE POLICY "caretakers_start_landlord_chat" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    conversation_type = 'manager_admin'
    AND tenant_id IS NULL
    AND manager_id = (SELECT auth.uid())
    AND public.current_app_role() = 'caretaker'
  );

DROP POLICY IF EXISTS "caretakers_send_landlord_chat_messages" ON public.chat_messages;
CREATE POLICY "caretakers_send_landlord_chat_messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.current_app_role() = 'caretaker'
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations AS conversation
      WHERE conversation.id = chat_messages.conversation_id
        AND conversation.conversation_type = 'manager_admin'
        AND conversation.manager_id = (SELECT auth.uid())
        AND conversation.tenant_id IS NULL
    )
  );

DROP POLICY IF EXISTS "caretakers_read_landlord_chat_messages" ON public.chat_messages;
CREATE POLICY "caretakers_read_landlord_chat_messages" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> (SELECT auth.uid())
    AND public.current_app_role() = 'caretaker'
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations AS conversation
      WHERE conversation.id = chat_messages.conversation_id
        AND conversation.conversation_type = 'manager_admin'
        AND conversation.manager_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> (SELECT auth.uid())
    AND public.current_app_role() = 'caretaker'
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversations AS conversation
      WHERE conversation.id = chat_messages.conversation_id
        AND conversation.conversation_type = 'manager_admin'
        AND conversation.manager_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.get_chat_presence(target_conversation_id uuid)
RETURNS TABLE (user_id uuid, chat_last_seen_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  conversation public.chat_conversations%ROWTYPE;
  chat_user_role text;
BEGIN
  chat_user_role := public.current_app_role();

  SELECT * INTO conversation
  FROM public.chat_conversations
  WHERE id = target_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF chat_user_role IS DISTINCT FROM 'admin'
    AND NOT (
      conversation.manager_id = (SELECT auth.uid())
      AND conversation.conversation_type = 'manager_admin'
      AND conversation.tenant_id IS NULL
      AND chat_user_role IN ('property_manager', 'caretaker')
    )
    AND NOT (
      conversation.manager_id = (SELECT auth.uid())
      AND chat_user_role = 'property_manager'
      AND conversation.conversation_type = 'manager_tenant'
      AND public.is_property_manager_for_tenant(conversation.tenant_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = conversation.tenant_id
        AND tenant.user_id = (SELECT auth.uid())
    )
  THEN
    RAISE EXCEPTION 'Not authorized to view this conversation presence';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.chat_last_seen_at
  FROM public.profiles AS profile
  WHERE (
    conversation.conversation_type IN ('tenant_admin', 'manager_admin')
    AND profile.role = 'admin'
  )
  OR profile.id = conversation.manager_id
  OR (
    conversation.tenant_id IS NOT NULL
    AND profile.id = (
      SELECT tenant.user_id
      FROM public.tenants AS tenant
      WHERE tenant.id = conversation.tenant_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_presence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_presence(uuid) TO authenticated;
