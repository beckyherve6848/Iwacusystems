DROP POLICY IF EXISTS "property_managers_select_assigned_maintenance" ON public.maintenance_requests;
CREATE POLICY "property_managers_select_assigned_maintenance" ON public.maintenance_requests
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

DROP POLICY IF EXISTS "property_managers_update_assigned_maintenance" ON public.maintenance_requests;
CREATE POLICY "property_managers_update_assigned_maintenance" ON public.maintenance_requests
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (public.is_property_manager_for_house(house_id));

DROP POLICY IF EXISTS "property_managers_notify_assigned_maintenance_tenants" ON public.notifications;
CREATE POLICY "property_managers_notify_assigned_maintenance_tenants" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'property_manager'
    AND notifications.maintenance_request_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_requests AS request
      JOIN public.tenants AS tenant
        ON tenant.id = request.tenant_id
      WHERE request.id = notifications.maintenance_request_id
        AND tenant.user_id = notifications.user_id
        AND tenant.status = 'active'
        AND public.is_property_manager_for_house(request.house_id)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'maintenance_requests'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_requests;
  END IF;
END;
$$;
