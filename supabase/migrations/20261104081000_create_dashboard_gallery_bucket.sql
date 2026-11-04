INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dashboard-gallery',
  'dashboard-gallery',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admin_upload_dashboard_gallery" ON storage.objects;
CREATE POLICY "admin_upload_dashboard_gallery" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dashboard-gallery'
    AND public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "admin_delete_dashboard_gallery" ON storage.objects;
CREATE POLICY "admin_delete_dashboard_gallery" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dashboard-gallery'
    AND public.current_app_role() = 'admin'
  );

DROP POLICY IF EXISTS "public_read_dashboard_gallery" ON storage.objects;
CREATE POLICY "public_read_dashboard_gallery" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dashboard-gallery');
