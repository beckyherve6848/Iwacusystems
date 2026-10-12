ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS invoice_id uuid
  REFERENCES public.utility_invoices(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_invoice_id
  ON public.notifications (invoice_id);

UPDATE public.notifications AS notification
SET invoice_id = invoice.id
FROM public.utility_invoices AS invoice
JOIN public.tenants AS tenant ON tenant.id = invoice.tenant_id
WHERE notification.invoice_id IS NULL
  AND notification.user_id = tenant.user_id
  AND notification.link = 'tenant-invoices'
  AND notification.message LIKE '%' || invoice.invoice_number || '%';

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
    NEW.sender_id := OLD.sender_id;
    NEW.announcement_id := OLD.announcement_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_paid_invoice_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.notifications
    WHERE invoice_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_paid_invoice_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS delete_paid_invoice_notifications ON public.utility_invoices;
CREATE TRIGGER delete_paid_invoice_notifications
  AFTER UPDATE OF status ON public.utility_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_paid_invoice_notifications();

DROP POLICY IF EXISTS "tenant_read_own_utility_invoices" ON public.utility_invoices;
CREATE POLICY "tenant_read_own_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (
    status = 'unpaid'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.user_id = (SELECT auth.uid())
        AND public.current_app_role() = 'tenant'
    )
  );

DROP POLICY IF EXISTS "admin_manage_utility_invoices" ON public.utility_invoices;
CREATE POLICY "admin_manage_utility_invoices" ON public.utility_invoices
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

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

DROP POLICY IF EXISTS "caretakers_select_assigned_utility_invoices" ON public.utility_invoices;
CREATE POLICY "caretakers_select_assigned_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (public.is_caretaker_for_house(house_id));

DROP POLICY IF EXISTS "caretakers_insert_assigned_utility_invoices" ON public.utility_invoices;
DROP POLICY IF EXISTS "caretakers_update_assigned_utility_invoices" ON public.utility_invoices;
DROP POLICY IF EXISTS "caretakers_delete_assigned_utility_invoices" ON public.utility_invoices;
DROP POLICY IF EXISTS "caretakers_notify_assigned_tenants" ON public.notifications;

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

NOTIFY pgrst, 'reload schema';
