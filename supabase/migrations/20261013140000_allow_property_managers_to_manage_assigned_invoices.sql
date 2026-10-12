DROP POLICY IF EXISTS "property_managers_select_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "property_managers_select_assigned_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

DROP POLICY IF EXISTS "property_managers_insert_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "property_managers_insert_assigned_utility_invoices" ON public.utility_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.house_id = utility_invoices.house_id
        AND tenant.status = 'active'
    )
  );

DROP POLICY IF EXISTS "property_managers_update_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "property_managers_update_assigned_utility_invoices" ON public.utility_invoices
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.house_id = utility_invoices.house_id
    )
  );

DROP POLICY IF EXISTS "property_managers_delete_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "property_managers_delete_assigned_utility_invoices" ON public.utility_invoices
  FOR DELETE TO authenticated
  USING (public.is_property_manager_for_house(house_id));

DROP POLICY IF EXISTS "property_managers_notify_assigned_tenants" ON public.notifications;
CREATE POLICY "property_managers_notify_assigned_tenants" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'property_manager'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.user_id = notifications.user_id
        AND public.is_property_manager_for_tenant(tenant.id)
    )
  );
