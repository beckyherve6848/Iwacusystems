DROP POLICY IF EXISTS "property_managers_select_assigned_utility_invoices"
  ON public.utility_invoices;

CREATE POLICY "property_managers_select_assigned_utility_invoices"
  ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() = 'property_manager'
    AND (
      public.is_property_manager_for_house(house_id)
      OR public.is_property_manager_for_tenant(tenant_id)
    )
  );
