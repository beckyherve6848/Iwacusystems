CREATE OR REPLACE FUNCTION public.delete_maintenance_request_notifications(
  p_maintenance_request_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR public.current_app_role() IS DISTINCT FROM 'admin'
  THEN
    RAISE EXCEPTION 'Only administrators can delete maintenance notifications'
      USING ERRCODE = '42501';
  END IF;

  IF p_maintenance_request_id IS NULL THEN
    RAISE EXCEPTION 'A maintenance request ID is required'
      USING ERRCODE = '22004';
  END IF;

  DELETE FROM public.notifications
  WHERE maintenance_request_id = p_maintenance_request_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_maintenance_request_notifications(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_maintenance_request_notifications(uuid)
  TO authenticated;
