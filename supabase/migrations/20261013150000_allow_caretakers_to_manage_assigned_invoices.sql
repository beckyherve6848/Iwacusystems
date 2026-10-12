DROP POLICY IF EXISTS "caretakers_select_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "caretakers_select_assigned_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (public.is_caretaker_for_house(house_id));

DROP POLICY IF EXISTS "caretakers_insert_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "caretakers_insert_assigned_utility_invoices" ON public.utility_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_caretaker_for_house(house_id)
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.house_id = utility_invoices.house_id
        AND tenant.status = 'active'
    )
  );

DROP POLICY IF EXISTS "caretakers_update_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "caretakers_update_assigned_utility_invoices" ON public.utility_invoices
  FOR UPDATE TO authenticated
  USING (public.is_caretaker_for_house(house_id))
  WITH CHECK (
    public.is_caretaker_for_house(house_id)
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.house_id = utility_invoices.house_id
    )
  );

DROP POLICY IF EXISTS "caretakers_delete_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "caretakers_delete_assigned_utility_invoices" ON public.utility_invoices
  FOR DELETE TO authenticated
  USING (public.is_caretaker_for_house(house_id));

DROP POLICY IF EXISTS "caretakers_notify_assigned_tenants" ON public.notifications;
CREATE POLICY "caretakers_notify_assigned_tenants" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'caretaker'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.user_id = notifications.user_id
        AND tenant.status = 'active'
        AND public.is_caretaker_for_house(tenant.house_id)
    )
  );
