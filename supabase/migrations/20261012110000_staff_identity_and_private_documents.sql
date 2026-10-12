ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_id text,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS residential_address text,
  ADD COLUMN IF NOT EXISTS profile_photo_path text,
  ADD COLUMN IF NOT EXISTS identity_document_path text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS national_id_document_path text;

CREATE SEQUENCE IF NOT EXISTS public.staff_id_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.assign_staff_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role IN ('property_manager', 'caretaker') AND NEW.staff_id IS NULL THEN
    NEW.staff_id := 'STAFF-' || lpad(nextval('public.staff_id_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_staff_id_on_profile_change ON public.profiles;
CREATE TRIGGER assign_staff_id_on_profile_change
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_staff_id();

UPDATE public.profiles
SET role = role
WHERE role IN ('property_manager', 'caretaker')
  AND staff_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_staff_id_unique
  ON public.profiles (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_staff_identity_fields()
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
      NEW.staff_id := NULL;
      NEW.national_id := NULL;
      NEW.residential_address := NULL;
      NEW.profile_photo_path := NULL;
      NEW.identity_document_path := NULL;
      RETURN NEW;
    END IF;

    IF NEW.staff_id IS DISTINCT FROM OLD.staff_id
      OR NEW.national_id IS DISTINCT FROM OLD.national_id
      OR NEW.residential_address IS DISTINCT FROM OLD.residential_address
      OR NEW.profile_photo_path IS DISTINCT FROM OLD.profile_photo_path
      OR NEW.identity_document_path IS DISTINCT FROM OLD.identity_document_path
      OR (
        (OLD.role IN ('property_manager', 'caretaker') OR NEW.role IN ('property_manager', 'caretaker'))
        AND (
          NEW.full_name IS DISTINCT FROM OLD.full_name
          OR NEW.email IS DISTINCT FROM OLD.email
          OR NEW.phone IS DISTINCT FROM OLD.phone
          OR NEW.assigned_property_id IS DISTINCT FROM OLD.assigned_property_id
          OR NEW.assigned_property_name IS DISTINCT FROM OLD.assigned_property_name
        )
      )
    THEN
      RAISE EXCEPTION 'Identity details can only be changed by an administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_staff_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_staff_identity_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_staff_identity_fields ON public.profiles;
CREATE TRIGGER protect_staff_identity_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_identity_fields();

CREATE OR REPLACE FUNCTION public.protect_tenant_identity_document_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND public.current_app_role() IS DISTINCT FROM 'admin'
    AND NEW.national_id_document_path IS DISTINCT FROM OLD.national_id_document_path
  THEN
    RAISE EXCEPTION 'Tenant identity documents can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_tenant_identity_document_path() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_tenant_identity_document_path ON public.tenants;
CREATE TRIGGER protect_tenant_identity_document_path
  BEFORE UPDATE OF national_id_document_path ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.protect_tenant_identity_document_path();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'identity-documents',
  'identity-documents',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admins_read_identity_documents" ON storage.objects;
CREATE POLICY "admins_read_identity_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-documents'
    AND public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "owners_read_identity_documents" ON storage.objects;
CREATE POLICY "owners_read_identity_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-documents'
    AND (
      (
        (storage.foldername(name))[1] = 'staff'
        AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
        AND public.current_app_role() IN ('property_manager', 'caretaker')
      )
      OR (
        (storage.foldername(name))[1] = 'tenants'
        AND EXISTS (
          SELECT 1
          FROM public.tenants AS tenant
          WHERE tenant.id::text = (storage.foldername(name))[2]
            AND tenant.user_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "admins_insert_identity_documents" ON storage.objects;
CREATE POLICY "admins_insert_identity_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'identity-documents'
    AND public.current_app_role() = 'admin'
    AND (
      (
        (storage.foldername(name))[1] = 'staff'
        AND EXISTS (
          SELECT 1 FROM public.profiles AS profile
          WHERE profile.id::text = (storage.foldername(name))[2]
            AND profile.role IN ('property_manager', 'caretaker')
        )
      )
      OR (
        (storage.foldername(name))[1] = 'tenants'
        AND EXISTS (
          SELECT 1 FROM public.tenants AS tenant
          WHERE tenant.id::text = (storage.foldername(name))[2]
        )
      )
    )
  );

DROP POLICY IF EXISTS "admins_update_identity_documents" ON storage.objects;
CREATE POLICY "admins_update_identity_documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'identity-documents' AND public.current_app_role() = 'admin')
  WITH CHECK (bucket_id = 'identity-documents' AND public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "admins_delete_identity_documents" ON storage.objects;
CREATE POLICY "admins_delete_identity_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'identity-documents' AND public.current_app_role() = 'admin');
