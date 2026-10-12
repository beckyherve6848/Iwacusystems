INSERT INTO settings (key, value, label) VALUES
  ('app_name', 'Iwacusystem', 'Application Name'),
  ('logo_url', '/iwacu-mark-512.png', 'Application Logo'),
  ('login_family_image_url', '', 'Login Family Image')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "public_select_login_brand_settings" ON settings;
CREATE POLICY "public_select_login_brand_settings" ON settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('app_name', 'logo_url', 'login_bg_url', 'login_family_image_url'));
