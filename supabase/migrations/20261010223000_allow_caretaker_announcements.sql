DROP POLICY IF EXISTS "tenant_read_announcements" ON public.announcements;
CREATE POLICY "tenant_read_announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'gatekeeper')
    OR target = (SELECT auth.uid())::text
    OR target = 'all'
    OR (target = 'all_tenants' AND public.current_app_role() = 'tenant')
    OR (target = 'all_caretakers' AND public.current_app_role() = 'caretaker')
    OR (target = 'all_users' AND public.current_app_role() IN ('tenant', 'caretaker'))
  );
