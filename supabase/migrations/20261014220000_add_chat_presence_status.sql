ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.update_chat_last_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  last_seen timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.profiles
  SET chat_last_seen_at = now()
  WHERE id = (SELECT auth.uid())
  RETURNING chat_last_seen_at INTO last_seen;

  IF last_seen IS NULL THEN
    RAISE EXCEPTION 'Profile not found for the authenticated user';
  END IF;

  RETURN last_seen;
END;
$$;

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
      AND chat_user_role = 'property_manager'
      AND (
        conversation.conversation_type = 'manager_admin'
        OR public.is_property_manager_for_tenant(conversation.tenant_id)
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tenants AS tenant
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

REVOKE ALL ON FUNCTION public.update_chat_last_seen() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_chat_presence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_chat_last_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_presence(uuid) TO authenticated;
