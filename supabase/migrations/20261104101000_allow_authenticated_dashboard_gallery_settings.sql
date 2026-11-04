DROP POLICY IF EXISTS "authenticated_read_dashboard_gallery_settings" ON public.settings;
CREATE POLICY "authenticated_read_dashboard_gallery_settings" ON public.settings
  FOR SELECT TO authenticated
  USING (key IN ('admin_overview_photos', 'admin_overview_photo_quotes'));
