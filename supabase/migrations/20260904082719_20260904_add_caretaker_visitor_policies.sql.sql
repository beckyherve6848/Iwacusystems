/*
# Add Caretaker Role to Visitor and Profile RLS Policies

1. Security Changes
- Update visitor INSERT policy to allow 'caretaker' role
- Update visitor SELECT policy to allow 'caretaker' role
- Update visitor UPDATE policy to allow 'caretaker' role (for check-in/check-out)
- No DELETE policy change (caretakers cannot delete visitors)

2. Notes
- Existing admin and gatekeeper access remains unchanged
- Caretakers can only insert, select, and update visitors (no delete)
- Profile SELECT is already open (true) so caretakers can read profiles
- Profile UPDATE allows self-update so caretakers can update their own profile
*/

-- Drop and recreate visitor policies to include 'caretaker' role
DROP POLICY IF EXISTS "admin_gk_insert_visitors" ON visitors;
CREATE POLICY "admin_gk_caretaker_insert_visitors" ON visitors FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'gatekeeper'::text, 'caretaker'::text]))
  );

DROP POLICY IF EXISTS "admin_gk_tenant_select_visitors" ON visitors;
CREATE POLICY "admin_gk_caretaker_tenant_select_visitors" ON visitors FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'gatekeeper'::text, 'caretaker'::text]))
    OR
    EXISTS (SELECT 1 FROM tenants
      WHERE tenants.id = visitors.tenant_id
      AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_gk_update_visitors" ON visitors;
CREATE POLICY "admin_gk_caretaker_update_visitors" ON visitors FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'gatekeeper'::text, 'caretaker'::text]))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'gatekeeper'::text, 'caretaker'::text]))
  );
