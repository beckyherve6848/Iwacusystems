CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

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
    NEW.role := 'tenant';
    NEW.is_active := true;
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

REVOKE ALL ON FUNCTION public.protect_profile_privileges() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

DROP POLICY IF EXISTS "users_select_profiles" ON public.profiles;
CREATE POLICY "users_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.current_app_role() = 'admin')
  WITH CHECK (id = (SELECT auth.uid()) OR public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_tenants" ON public.tenants;
CREATE POLICY "admin_update_tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_agreements" ON public.rental_agreements;
CREATE POLICY "admin_update_agreements" ON public.rental_agreements
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_maintenance" ON public.maintenance_requests;
CREATE POLICY "admin_update_maintenance" ON public.maintenance_requests
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "admin_tenant_insert_maintenance" ON public.maintenance_requests;
CREATE POLICY "admin_tenant_insert_maintenance" ON public.maintenance_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.tenants AS t
      WHERE t.id = maintenance_requests.tenant_id
        AND t.user_id = (SELECT auth.uid())
        AND t.house_id = maintenance_requests.house_id
    )
  );

DROP POLICY IF EXISTS "authenticated_select_settings" ON public.settings;
CREATE POLICY "authenticated_select_settings" ON public.settings
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() = 'admin'
    OR key IN (
      'property_name',
      'bank_name',
      'account_name',
      'account_number',
      'mobile_money_number',
      'payment_reference'
    )
  );

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
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_user_notifications ON public.notifications;
CREATE TRIGGER protect_user_notifications
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_notifications();

CREATE OR REPLACE FUNCTION public.protect_chat_message_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.current_app_role() IS DISTINCT FROM 'admin' THEN
    NEW.id := OLD.id;
    NEW.conversation_id := OLD.conversation_id;
    NEW.sender_id := OLD.sender_id;
    NEW.body := OLD.body;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_chat_message_updates() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_chat_message_updates ON public.chat_messages;
CREATE TRIGGER protect_chat_message_updates
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_chat_message_updates();

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_length
    CHECK (char_length(trim(full_name)) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT profiles_phone_length
    CHECK (phone IS NULL OR char_length(phone) <= 40) NOT VALID;

ALTER TABLE public.maintenance_requests
  ADD CONSTRAINT maintenance_title_length
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT maintenance_description_length
    CHECK (char_length(trim(description)) BETWEEN 1 AND 4000) NOT VALID;

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
WHERE id = 'login-bg';

DROP POLICY IF EXISTS "allow_auth_upload_login_bg" ON storage.objects;
CREATE POLICY "admin_upload_login_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'login-bg'
    AND public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "allow_auth_delete_login_bg" ON storage.objects;
CREATE POLICY "admin_delete_login_assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'login-bg'
    AND public.current_app_role() = 'admin'
  );
