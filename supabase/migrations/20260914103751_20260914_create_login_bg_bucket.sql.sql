-- Create a storage bucket for login background images
INSERT INTO storage.buckets (id, name, public)
VALUES ('login-bg', 'login-bg', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to login-bg bucket
CREATE POLICY "allow_auth_upload_login_bg" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'login-bg');

-- Allow public read of login-bg objects
CREATE POLICY "allow_public_read_login_bg" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'login-bg');

-- Allow authenticated users to delete login-bg objects
CREATE POLICY "allow_auth_delete_login_bg" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'login-bg');
