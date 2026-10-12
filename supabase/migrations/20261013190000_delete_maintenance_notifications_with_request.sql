ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS maintenance_request_id uuid
  REFERENCES public.maintenance_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_maintenance_request_id
  ON public.notifications (maintenance_request_id);

UPDATE public.notifications AS notification
SET maintenance_request_id = request.id
FROM public.maintenance_requests AS request
JOIN public.tenants AS tenant ON tenant.id = request.tenant_id
WHERE notification.maintenance_request_id IS NULL
  AND notification.user_id = tenant.user_id
  AND notification.title = 'Maintenance request updated'
  AND notification.link = 'tenant-maintenance'
  AND notification.message LIKE ('Your request "' || request.title || '" is now %')
  AND (
    SELECT count(*)
    FROM public.maintenance_requests AS matching_request
    JOIN public.tenants AS matching_tenant ON matching_tenant.id = matching_request.tenant_id
    WHERE matching_tenant.user_id = notification.user_id
      AND matching_request.title = request.title
      AND notification.message LIKE ('Your request "' || matching_request.title || '" is now %')
  ) = 1;

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
    NEW.invoice_id := OLD.invoice_id;
    NEW.maintenance_request_id := OLD.maintenance_request_id;
    NEW.sender_id := OLD.sender_id;
    NEW.announcement_id := OLD.announcement_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
