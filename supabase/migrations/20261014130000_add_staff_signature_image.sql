ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_image_path text;

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
      NEW.signature_image_path := NULL;
      RETURN NEW;
    END IF;

    IF NEW.staff_id IS DISTINCT FROM OLD.staff_id
      OR NEW.national_id IS DISTINCT FROM OLD.national_id
      OR NEW.residential_address IS DISTINCT FROM OLD.residential_address
      OR NEW.profile_photo_path IS DISTINCT FROM OLD.profile_photo_path
      OR NEW.identity_document_path IS DISTINCT FROM OLD.identity_document_path
      OR NEW.signature_image_path IS DISTINCT FROM OLD.signature_image_path
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

REVOKE ALL ON FUNCTION public.protect_staff_identity_fields() FROM PUBLIC;
