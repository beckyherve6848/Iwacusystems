CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT profile.role
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid())
$$;

ALTER FUNCTION public.current_app_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

DROP POLICY IF EXISTS "users_select_profiles" ON public.profiles;
CREATE POLICY "users_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.current_app_role() = 'admin'
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "admin_delete_profiles" ON public.profiles;
CREATE POLICY "admin_delete_profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');
