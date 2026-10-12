/*
# Create Announcements Table

1. New Tables
- `announcements` — admin-authored messages broadcast to tenants
  - `id` (uuid, primary key)
  - `title` (text, not null)
  - `message` (text, not null, up to ~100K chars — no DB limit imposed)
  - `type` (text: info/warning/success/error)
  - `target` (text: 'all' or specific tenant user_id)
  - `created_by` (uuid, references auth.users)
  - `created_at` (timestamp)

2. Security
- RLS enabled
- Admins can insert/update/delete their own announcements
- All authenticated users can read announcements targeted to them or 'all'
*/

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','success','error')),
  target text NOT NULL DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_insert_announcements" ON announcements;
CREATE POLICY "admin_insert_announcements" ON announcements FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_announcements" ON announcements;
CREATE POLICY "admin_update_announcements" ON announcements FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_delete_announcements" ON announcements;
CREATE POLICY "admin_delete_announcements" ON announcements FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "tenant_read_announcements" ON announcements;
CREATE POLICY "tenant_read_announcements" ON announcements FOR SELECT
TO authenticated
USING (
  target = 'all'
  OR target = auth.uid()::text
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','gatekeeper'))
);
