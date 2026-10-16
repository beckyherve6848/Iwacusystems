CREATE OR REPLACE FUNCTION public.get_tenant_property_managers()
RETURNS TABLE (manager_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT manager.id, manager.full_name
  FROM public.tenants AS tenant
  JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
  JOIN public.profiles AS manager ON manager.id = assignment.manager_id
  WHERE tenant.user_id = (SELECT auth.uid())
    AND public.current_app_role() = 'tenant'
    AND manager.role = 'property_manager'
    AND manager.is_active
  ORDER BY manager.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_property_managers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_property_managers() TO authenticated;

DROP POLICY IF EXISTS "tenants_start_assigned_manager_chat" ON public.chat_conversations;
CREATE POLICY "tenants_start_assigned_manager_chat" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    conversation_type = 'manager_tenant'
    AND public.current_app_role() = 'tenant'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
      JOIN public.profiles AS manager ON manager.id = assignment.manager_id
      WHERE tenant.id = chat_conversations.tenant_id
        AND tenant.user_id = (SELECT auth.uid())
        AND assignment.manager_id = chat_conversations.manager_id
        AND manager.role = 'property_manager'
        AND manager.is_active
    )
  );
