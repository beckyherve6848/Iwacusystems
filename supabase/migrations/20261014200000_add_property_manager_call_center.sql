ALTER TABLE public.chat_conversations
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS conversation_type text NOT NULL DEFAULT 'tenant_admin',
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS admin_read_at timestamptz;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_tenant_id_key,
  DROP CONSTRAINT IF EXISTS chat_conversations_type_participants_check;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_type_participants_check CHECK (
    (conversation_type = 'tenant_admin' AND tenant_id IS NOT NULL AND manager_id IS NULL)
    OR (conversation_type = 'manager_admin' AND tenant_id IS NULL AND manager_id IS NOT NULL)
    OR (conversation_type = 'manager_tenant' AND tenant_id IS NOT NULL AND manager_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_tenant_admin_unique
  ON public.chat_conversations (tenant_id)
  WHERE conversation_type = 'tenant_admin';

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_manager_admin_unique
  ON public.chat_conversations (manager_id)
  WHERE conversation_type = 'manager_admin';

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_manager_tenant_unique
  ON public.chat_conversations (manager_id, tenant_id)
  WHERE conversation_type = 'manager_tenant';

CREATE INDEX IF NOT EXISTS chat_conversations_manager_id_idx
  ON public.chat_conversations (manager_id)
  WHERE manager_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_chat_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_chat_conversation_timestamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS update_chat_conversation_timestamp ON public.chat_messages;
CREATE TRIGGER update_chat_conversation_timestamp
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_conversation_timestamp();

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() = 'admin'
    OR (
      conversation_type IN ('tenant_admin', 'manager_tenant')
      AND EXISTS (
        SELECT 1 FROM public.tenants AS tenant
        WHERE tenant.id = chat_conversations.tenant_id
          AND tenant.user_id = (SELECT auth.uid())
      )
    )
    OR (
      conversation_type = 'manager_admin'
      AND manager_id = (SELECT auth.uid())
      AND public.current_app_role() = 'property_manager'
    )
    OR (
      conversation_type = 'manager_tenant'
      AND manager_id = (SELECT auth.uid())
      AND public.current_app_role() = 'property_manager'
      AND EXISTS (
        SELECT 1
        FROM public.tenants AS tenant
        JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
        WHERE tenant.id = chat_conversations.tenant_id
          AND assignment.manager_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "chat_conversations_insert" ON public.chat_conversations;
CREATE POLICY "chat_conversations_insert" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      conversation_type = 'tenant_admin'
      AND manager_id IS NULL
      AND (
        public.current_app_role() = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.tenants AS tenant
          WHERE tenant.id = chat_conversations.tenant_id
            AND tenant.user_id = (SELECT auth.uid())
        )
      )
    )
    OR (
      conversation_type = 'manager_admin'
      AND tenant_id IS NULL
      AND (
        (manager_id = (SELECT auth.uid()) AND public.current_app_role() = 'property_manager')
        OR public.current_app_role() = 'admin'
      )
    )
    OR (
      conversation_type = 'manager_tenant'
      AND manager_id = (SELECT auth.uid())
      AND public.current_app_role() = 'property_manager'
      AND EXISTS (
        SELECT 1
        FROM public.tenants AS tenant
        JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
        WHERE tenant.id = chat_conversations.tenant_id
          AND assignment.manager_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "chat_conversations_update" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_delete" ON public.chat_conversations;
CREATE POLICY "chat_conversations_delete" ON public.chat_conversations
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations AS conversation
      WHERE conversation.id = chat_messages.conversation_id
    )
  );

DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS conversation
      WHERE conversation.id = chat_messages.conversation_id
        AND (
          public.current_app_role() = 'admin'
          OR (
            conversation.manager_id = (SELECT auth.uid())
            AND public.current_app_role() = 'property_manager'
            AND (
              conversation.conversation_type = 'manager_admin'
              OR EXISTS (
                SELECT 1
                FROM public.tenants AS tenant
                JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
                WHERE tenant.id = conversation.tenant_id
                  AND assignment.manager_id = (SELECT auth.uid())
              )
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.tenants AS tenant
            WHERE tenant.id = conversation.tenant_id
              AND tenant.user_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.protect_chat_message_read_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.admin_read_at IS DISTINCT FROM OLD.admin_read_at
    AND ROW(NEW.id, NEW.conversation_id, NEW.sender_id, NEW.body, NEW.created_at, NEW.read_at, NEW.reply_to_id)
      IS NOT DISTINCT FROM
        ROW(OLD.id, OLD.conversation_id, OLD.sender_id, OLD.body, OLD.created_at, OLD.read_at, OLD.reply_to_id)
    AND public.current_app_role() = 'admin'
    AND OLD.admin_read_at IS NULL
    AND NEW.admin_read_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS conversation
      WHERE conversation.id = OLD.conversation_id
        AND conversation.conversation_type = 'manager_tenant'
    ) THEN
    RETURN NEW;
  END IF;

  IF NEW.read_at IS DISTINCT FROM OLD.read_at
    AND public.current_app_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations AS conversation
      WHERE conversation.id = OLD.conversation_id
        AND conversation.conversation_type = 'manager_tenant'
    ) THEN
    RAISE EXCEPTION 'Administrators must use the administrator read receipt for manager/tenant conversations';
  END IF;

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
    RAISE EXCEPTION 'Only the recipient or an administrator can mark an unread message as read';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> (SELECT auth.uid())
    AND (
      public.current_app_role() = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        WHERE conversation.id = chat_messages.conversation_id
          AND (
            (
              conversation.manager_id = (SELECT auth.uid())
              AND (
                conversation.conversation_type = 'manager_admin'
                OR EXISTS (
                  SELECT 1
                  FROM public.tenants AS tenant
                  JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
                  WHERE tenant.id = conversation.tenant_id
                    AND assignment.manager_id = (SELECT auth.uid())
                )
              )
            )
            OR EXISTS (
              SELECT 1 FROM public.tenants AS tenant
              WHERE tenant.id = conversation.tenant_id
                AND tenant.user_id = (SELECT auth.uid())
            )
          )
      )
    )
  )
  WITH CHECK (
    sender_id <> (SELECT auth.uid())
    AND (
      public.current_app_role() = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        WHERE conversation.id = chat_messages.conversation_id
          AND (
            (
              conversation.manager_id = (SELECT auth.uid())
              AND (
                conversation.conversation_type = 'manager_admin'
                OR EXISTS (
                  SELECT 1
                  FROM public.tenants AS tenant
                  JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
                  WHERE tenant.id = conversation.tenant_id
                    AND assignment.manager_id = (SELECT auth.uid())
                )
              )
            )
            OR EXISTS (
              SELECT 1 FROM public.tenants AS tenant
              WHERE tenant.id = conversation.tenant_id
                AND tenant.user_id = (SELECT auth.uid())
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;
CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');
