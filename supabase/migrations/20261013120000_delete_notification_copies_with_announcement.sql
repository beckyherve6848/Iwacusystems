CREATE OR REPLACE FUNCTION public.delete_announcement_with_notifications(p_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can delete announcements'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.notifications
  WHERE announcement_id = p_announcement_id;

  DELETE FROM public.announcements
  WHERE id = p_announcement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement not found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_announcement_with_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_announcement_with_notifications(uuid) TO authenticated;
