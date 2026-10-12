ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_announcement_id
  ON public.notifications (announcement_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "users_select_own_notifications" ON public.notifications;
CREATE POLICY "users_select_own_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      sender_id = auth.uid()
      AND public.current_app_role() = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.protect_user_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.current_app_role() IS DISTINCT FROM 'admin' THEN
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.title := OLD.title;
    NEW.message := OLD.message;
    NEW.type := OLD.type;
    NEW.link := OLD.link;
    NEW.sender_id := OLD.sender_id;
    NEW.announcement_id := OLD.announcement_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
