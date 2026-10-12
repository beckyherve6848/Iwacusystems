INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'login-bg',
  'login-bg',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "allow_auth_upload_login_bg" ON storage.objects;
DROP POLICY IF EXISTS "allow_auth_delete_login_bg" ON storage.objects;
DROP POLICY IF EXISTS "allow_public_read_login_bg" ON storage.objects;
DROP POLICY IF EXISTS "admin_upload_login_assets" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_login_assets" ON storage.objects;
DROP POLICY IF EXISTS "public_read_login_assets" ON storage.objects;

CREATE POLICY "admin_upload_login_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'login-bg'
    AND public.current_app_role() = 'admin'
  );

CREATE POLICY "admin_delete_login_assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'login-bg'
    AND public.current_app_role() = 'admin'
  );

CREATE POLICY "public_read_login_assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'login-bg');
