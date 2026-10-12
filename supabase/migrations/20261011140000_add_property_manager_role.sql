ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gatekeeper', 'tenant', 'caretaker', 'property_manager'));

CREATE TABLE public.property_manager_houses (
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_id, house_id)
);

ALTER TABLE public.property_manager_houses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_property_manager_for_house(target_house_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_manager_houses AS pmh
    JOIN public.profiles AS p ON p.id = pmh.manager_id
    WHERE pmh.manager_id = (SELECT auth.uid())
      AND pmh.house_id = target_house_id
      AND p.role = 'property_manager'
      AND p.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_property_manager_for_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants AS t
    WHERE t.id = target_tenant_id
      AND public.is_property_manager_for_house(t.house_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.assign_property_manager_houses(target_manager_id uuid, target_house_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requested_count integer;
  valid_count integer;
BEGIN
  IF public.current_app_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can assign property managers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_manager_id AND role = 'property_manager'
  ) THEN
    RAISE EXCEPTION 'Property manager account not found';
  END IF;

  requested_count := COALESCE(cardinality(target_house_ids), 0);
  SELECT count(DISTINCT selected.house_id) INTO valid_count
  FROM unnest(COALESCE(target_house_ids, ARRAY[]::uuid[])) AS selected(house_id);

  IF requested_count <> valid_count THEN
    RAISE EXCEPTION 'Duplicate property assignments are not allowed';
  END IF;

  SELECT count(*) INTO valid_count
  FROM public.houses
  WHERE id = ANY(COALESCE(target_house_ids, ARRAY[]::uuid[]));

  IF requested_count <> valid_count THEN
    RAISE EXCEPTION 'One or more selected properties do not exist';
  END IF;

  DELETE FROM public.property_manager_houses WHERE manager_id = target_manager_id;

  INSERT INTO public.property_manager_houses (manager_id, house_id)
  SELECT target_manager_id, selected.house_id
  FROM unnest(COALESCE(target_house_ids, ARRAY[]::uuid[])) AS selected(house_id);

  UPDATE public.profiles
  SET is_active = requested_count > 0, updated_at = now()
  WHERE id = target_manager_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_property_manager_for_house(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_property_manager_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_property_manager_houses(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_property_manager_for_house(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_manager_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_property_manager_houses(uuid, uuid[]) TO authenticated;

CREATE POLICY "property_managers_read_own_assignments" ON public.property_manager_houses
  FOR SELECT TO authenticated
  USING (manager_id = (SELECT auth.uid()));

CREATE POLICY "admins_manage_manager_assignments" ON public.property_manager_houses
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "users_select_profiles" ON public.profiles;
CREATE POLICY "users_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_app_role() = 'admin');

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'property_manager' THEN
      NEW.role := 'property_manager';
      NEW.is_active := false;
    ELSE
      NEW.role := 'tenant';
      NEW.is_active := true;
    END IF;
    NEW.assigned_property_id := NULL;
    NEW.assigned_property_name := NULL;
    NEW.email := COALESCE(auth.jwt() ->> 'email', NEW.email);
  ELSE
    NEW.role := OLD.role;
    NEW.is_active := OLD.is_active;
    NEW.assigned_property_id := OLD.assigned_property_id;
    NEW.assigned_property_name := OLD.assigned_property_name;
    NEW.email := OLD.email;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "authenticated_select_houses" ON public.houses;
CREATE POLICY "authenticated_select_houses" ON public.houses
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() <> 'property_manager'
    OR public.is_property_manager_for_house(id)
  );

CREATE POLICY "property_managers_update_assigned_houses" ON public.houses
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(id))
  WITH CHECK (public.is_property_manager_for_house(id));

CREATE POLICY "property_managers_select_assigned_tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_insert_assigned_tenants" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_update_assigned_tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_select_assigned_tenant_family" ON public.tenant_family
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_tenant(tenant_id));

CREATE POLICY "property_managers_insert_assigned_tenant_family" ON public.tenant_family
  FOR INSERT TO authenticated
  WITH CHECK (public.is_property_manager_for_tenant(tenant_id));

CREATE POLICY "property_managers_update_assigned_tenant_family" ON public.tenant_family
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_tenant(tenant_id))
  WITH CHECK (public.is_property_manager_for_tenant(tenant_id));

CREATE POLICY "property_managers_delete_assigned_tenant_family" ON public.tenant_family
  FOR DELETE TO authenticated
  USING (public.is_property_manager_for_tenant(tenant_id));

CREATE POLICY "property_managers_select_assigned_occupancies" ON public.occupancies
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_insert_assigned_occupancies" ON public.occupancies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = occupancies.house_id)
  );

CREATE POLICY "property_managers_update_assigned_occupancies" ON public.occupancies
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = occupancies.house_id)
  );

CREATE POLICY "property_managers_delete_assigned_occupancies" ON public.occupancies
  FOR DELETE TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_select_assigned_payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_insert_assigned_payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = payments.house_id)
  );

CREATE POLICY "property_managers_update_assigned_payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = payments.house_id)
  );

CREATE POLICY "property_managers_delete_assigned_payments" ON public.payments
  FOR DELETE TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_select_assigned_maintenance" ON public.maintenance_requests
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_update_assigned_maintenance" ON public.maintenance_requests
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_delete_assigned_maintenance" ON public.maintenance_requests
  FOR DELETE TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_select_assigned_visitors" ON public.visitors
  FOR SELECT TO authenticated
  USING (public.is_property_manager_for_house(house_id));

CREATE POLICY "property_managers_insert_assigned_visitors" ON public.visitors
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND (
      tenant_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = visitors.house_id)
    )
  );

CREATE POLICY "property_managers_update_assigned_visitors" ON public.visitors
  FOR UPDATE TO authenticated
  USING (public.is_property_manager_for_house(house_id))
  WITH CHECK (
    public.is_property_manager_for_house(house_id)
    AND (
      tenant_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND house_id = visitors.house_id)
    )
  );

CREATE POLICY "property_managers_read_payment_methods" ON public.settings
  FOR SELECT TO authenticated
  USING (
    key = 'custom_payment_methods'
    AND public.current_app_role() = 'property_manager'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND is_active
        AND role = 'property_manager'
    )
  );
