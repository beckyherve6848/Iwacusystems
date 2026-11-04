DROP POLICY IF EXISTS "authenticated_read_dashboard_gallery_settings" ON public.settings;
DROP POLICY IF EXISTS "public_read_dashboard_gallery_settings" ON public.settings;
CREATE POLICY "public_read_dashboard_gallery_settings" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('admin_overview_photos', 'admin_overview_photo_quotes'));
