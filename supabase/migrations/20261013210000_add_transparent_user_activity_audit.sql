CREATE TABLE public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL
    CONSTRAINT user_activity_events_actor_id_fkey
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_role text NOT NULL CHECK (actor_role IN ('tenant', 'property_manager', 'caretaker')),
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'data_change', 'chat_message')),
  page_key text,
  action_key text,
  entity_table text,
  entity_id uuid,
  chat_message_id uuid
    CONSTRAINT user_activity_events_chat_message_id_fkey
    REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_activity_events_created_idx
  ON public.user_activity_events (created_at DESC);
CREATE INDEX user_activity_events_actor_created_idx
  ON public.user_activity_events (actor_id, created_at DESC);
CREATE INDEX user_activity_events_event_type_idx
  ON public.user_activity_events (event_type, created_at DESC);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_activity_events FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_activity_events TO authenticated;

CREATE POLICY "admins_read_user_activity_events"
  ON public.user_activity_events FOR SELECT TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE POLICY "tracked_users_record_own_page_views"
  ON public.user_activity_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND event_type = 'page_view'
    AND actor_role = (
      SELECT profile.role
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
    )
    AND actor_role IN ('tenant', 'property_manager', 'caretaker')
    AND page_key IN (
      'tenant-dashboard', 'tenant-payments', 'tenant-invoices', 'tenant-maintenance',
      'tenant-agreement', 'tenant-chat', 'notifications',
      'manager-dashboard', 'houses', 'tenants', 'invoices', 'payments',
      'maintenance', 'visitors', 'reports',
      'caretaker-dashboard', 'caretaker-visitors', 'caretaker-register-visitor',
      'caretaker-profile'
    )
  );

CREATE POLICY "admins_delete_user_activity_events"
  ON public.user_activity_events FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE OR REPLACE FUNCTION public.admin_user_activity_summary(p_actor_id uuid)
RETURNS TABLE(event_type text, page_key text, event_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT activity.event_type, activity.page_key, count(*) AS event_count
  FROM public.user_activity_events AS activity
  WHERE activity.actor_id = p_actor_id
    AND public.current_app_role() = 'admin'
  GROUP BY activity.event_type, activity.page_key;
$$;

REVOKE ALL ON FUNCTION public.admin_user_activity_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_activity_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_user_activity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_role text;
  row_data jsonb;
  old_data jsonb;
  changed_fields text[];
  safe_values jsonb;
  record_id uuid;
BEGIN
  SELECT profile.role INTO actor_role
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid());

  IF actor_role IS NULL OR actor_role NOT IN ('tenant', 'property_manager', 'caretaker') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;
  record_id := (row_data ->> 'id')::uuid;

  IF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    SELECT array_agg(updated.key ORDER BY updated.key)
    INTO changed_fields
    FROM jsonb_each(row_data) AS updated
    JOIN jsonb_each(old_data) AS previous ON previous.key = updated.key
    WHERE updated.value IS DISTINCT FROM previous.value;

    SELECT jsonb_object_agg(updated.key, updated.value)
    INTO safe_values
    FROM jsonb_each(row_data) AS updated
    JOIN jsonb_each(old_data) AS previous ON previous.key = updated.key
    WHERE updated.value IS DISTINCT FROM previous.value
      AND updated.key IN ('status', 'priority', 'is_active');
  ELSIF TG_OP = 'INSERT' THEN
    SELECT jsonb_object_agg(inserted.key, inserted.value)
    INTO safe_values
    FROM jsonb_each(row_data) AS inserted
    WHERE inserted.key IN ('status', 'priority', 'is_active');
  END IF;

  INSERT INTO public.user_activity_events (
    actor_id, actor_role, event_type, action_key, entity_table, entity_id, metadata
  )
  VALUES (
    (SELECT auth.uid()),
    actor_role,
    'data_change',
    lower(TG_OP) || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    record_id,
    CASE WHEN TG_OP = 'UPDATE'
      THEN jsonb_build_object('changed_fields', COALESCE(changed_fields, ARRAY[]::text[]))
      ELSE '{}'::jsonb
    END || jsonb_build_object('safe_values', COALESCE(safe_values, '{}'::jsonb))
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_activity_change() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_user_chat_message_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT profile.role INTO actor_role
  FROM public.profiles AS profile
  WHERE profile.id = NEW.sender_id;

  IF actor_role IN ('tenant', 'property_manager', 'caretaker') THEN
    INSERT INTO public.user_activity_events (
      actor_id, actor_role, event_type, action_key, entity_table, entity_id, chat_message_id
    )
    VALUES (
      NEW.sender_id,
      actor_role,
      'chat_message',
      'sent_message',
      'chat_messages',
      NEW.id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_chat_message_activity() FROM PUBLIC;

CREATE TRIGGER record_user_chat_message_activity
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.record_user_chat_message_activity();

CREATE OR REPLACE FUNCTION public.record_user_chat_read_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_role text;
BEGIN
  IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile.role INTO actor_role
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid());

  IF actor_role IN ('tenant', 'property_manager', 'caretaker') THEN
    INSERT INTO public.user_activity_events (
      actor_id, actor_role, event_type, action_key, entity_table, entity_id, chat_message_id
    )
    VALUES (
      (SELECT auth.uid()),
      actor_role,
      'chat_message',
      'read_message',
      'chat_messages',
      NEW.id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_chat_read_activity() FROM PUBLIC;

CREATE TRIGGER record_user_chat_read_activity
  AFTER UPDATE OF read_at ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.record_user_chat_read_activity();

DO $$
DECLARE
  tracked_table text;
BEGIN
  FOREACH tracked_table IN ARRAY ARRAY[
    'profiles', 'tenants', 'houses', 'rental_agreements', 'payments',
    'utility_invoices', 'maintenance_requests', 'visitors'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER record_user_activity_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_user_activity_change()',
      tracked_table
    );
  END LOOP;
END;
$$;
