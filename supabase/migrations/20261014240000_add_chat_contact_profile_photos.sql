DROP FUNCTION IF EXISTS public.get_tenant_property_managers();

CREATE FUNCTION public.get_tenant_property_managers()
RETURNS TABLE (manager_id uuid, full_name text, profile_photo_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT manager.id, manager.full_name, manager.profile_photo_path
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

DROP POLICY IF EXISTS "tenants_read_assigned_manager_profile_photos" ON storage.objects;
CREATE POLICY "tenants_read_assigned_manager_profile_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-documents'
    AND public.current_app_role() = 'tenant'
    AND (storage.foldername(name))[1] = 'staff'
    AND storage.filename(name) LIKE 'photo-%'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      JOIN public.property_manager_houses AS assignment ON assignment.house_id = tenant.house_id
      JOIN public.profiles AS manager ON manager.id = assignment.manager_id
      WHERE tenant.user_id = (SELECT auth.uid())
        AND manager.id::text = (storage.foldername(name))[2]
        AND manager.role = 'property_manager'
        AND manager.is_active
    )
  );
