CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_properties" ON public.properties;
CREATE POLICY "authenticated_select_properties" ON public.properties
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins_manage_properties" ON public.properties;
CREATE POLICY "admins_manage_properties" ON public.properties
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_property_group_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

INSERT INTO public.properties (name)
SELECT 'Unassigned - ' || house.house_number
FROM public.houses AS house
WHERE house.property_id IS NULL;

UPDATE public.houses AS house
SET property_id = property.id
FROM public.properties AS property
WHERE house.property_id IS NULL
  AND property.name = 'Unassigned - ' || house.house_number;

UPDATE public.profiles AS profile
SET assigned_property_group_id = house.property_id
FROM public.houses AS house
WHERE profile.role = 'caretaker'
  AND profile.assigned_property_group_id IS NULL
  AND profile.assigned_property_id = house.id;

UPDATE public.profiles AS profile
SET assigned_property_name = property.name
FROM public.properties AS property
WHERE profile.role = 'caretaker'
  AND profile.assigned_property_group_id = property.id
  AND profile.assigned_property_name IS DISTINCT FROM property.name;

CREATE INDEX IF NOT EXISTS idx_houses_property_id ON public.houses(property_id);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_property_group_id ON public.profiles(assigned_property_group_id);

CREATE OR REPLACE FUNCTION public.protect_staff_property_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND public.current_app_role() IS DISTINCT FROM 'admin'
  THEN
    IF TG_OP = 'INSERT' THEN
      NEW.assigned_property_group_id := NULL;
    ELSIF NEW.assigned_property_group_id IS DISTINCT FROM OLD.assigned_property_group_id THEN
      RAISE EXCEPTION 'Staff property assignments can only be changed by an administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_staff_property_assignment() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_staff_property_assignment ON public.profiles;
CREATE TRIGGER protect_staff_property_assignment
  BEFORE INSERT OR UPDATE OF assigned_property_group_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_property_assignment();

CREATE OR REPLACE FUNCTION public.is_caretaker_for_house(target_house_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS caretaker
    JOIN public.houses AS house ON house.property_id = caretaker.assigned_property_group_id
    WHERE caretaker.id = (SELECT auth.uid())
      AND caretaker.role = 'caretaker'
      AND caretaker.is_active
      AND house.id = target_house_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_caretaker_for_house(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_caretaker_for_house(uuid) TO authenticated;

DROP POLICY IF EXISTS "authenticated_select_houses" ON public.houses;
CREATE POLICY "authenticated_select_houses" ON public.houses
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() NOT IN ('property_manager', 'caretaker')
    OR public.is_property_manager_for_house(id)
    OR public.is_caretaker_for_house(id)
  );

DROP POLICY IF EXISTS "admin_gk_caretaker_tenant_select_visitors" ON public.visitors;
CREATE POLICY "admin_gk_caretaker_tenant_select_visitors" ON public.visitors
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'gatekeeper')
    OR (public.current_app_role() = 'caretaker' AND public.is_caretaker_for_house(house_id))
    OR EXISTS (
      SELECT 1 FROM public.tenants AS tenant
      WHERE tenant.id = visitors.tenant_id AND tenant.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_gk_caretaker_insert_visitors" ON public.visitors;
CREATE POLICY "admin_gk_caretaker_insert_visitors" ON public.visitors
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('admin', 'gatekeeper')
    OR (
      public.current_app_role() = 'caretaker'
      AND public.is_caretaker_for_house(house_id)
      AND (
        tenant_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.tenants AS tenant
          WHERE tenant.id = visitors.tenant_id AND tenant.house_id = visitors.house_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "admin_gk_caretaker_update_visitors" ON public.visitors;
CREATE POLICY "admin_gk_caretaker_update_visitors" ON public.visitors
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'gatekeeper')
    OR (public.current_app_role() = 'caretaker' AND public.is_caretaker_for_house(house_id))
  )
  WITH CHECK (
    public.current_app_role() IN ('admin', 'gatekeeper')
    OR (
      public.current_app_role() = 'caretaker'
      AND public.is_caretaker_for_house(house_id)
      AND (
        tenant_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.tenants AS tenant
          WHERE tenant.id = visitors.tenant_id AND tenant.house_id = visitors.house_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "caretakers_select_assigned_property_tenants" ON public.tenants;
CREATE POLICY "caretakers_select_assigned_property_tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() = 'caretaker'
    AND public.is_caretaker_for_house(house_id)
  );

CREATE OR REPLACE FUNCTION public.assign_property_manager_houses(target_manager_id uuid, target_house_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requested_count integer;
  valid_count integer;
  conflict_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND public.current_app_role() IS DISTINCT FROM 'admin'
  THEN
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
    RAISE EXCEPTION 'Duplicate house assignments are not allowed';
  END IF;

  SELECT count(*) INTO valid_count
  FROM public.houses
  WHERE id = ANY(COALESCE(target_house_ids, ARRAY[]::uuid[]));

  IF requested_count <> valid_count THEN
    RAISE EXCEPTION 'One or more selected houses do not exist';
  END IF;

  PERFORM house.id
  FROM public.houses AS house
  WHERE house.id = ANY(COALESCE(target_house_ids, ARRAY[]::uuid[]))
  ORDER BY house.id
  FOR UPDATE;

  SELECT count(*) INTO conflict_count
  FROM public.property_manager_houses AS assignment
  WHERE assignment.house_id = ANY(COALESCE(target_house_ids, ARRAY[]::uuid[]))
    AND assignment.manager_id <> target_manager_id;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'One or more selected houses are already assigned to another property manager';
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

REVOKE ALL ON FUNCTION public.assign_property_manager_houses(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_property_manager_houses(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_property_manager_houses(uuid, uuid[]) TO service_role;
