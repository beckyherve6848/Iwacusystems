/*
# Property Management System - Part 2: Tenants, Family, Occupancies

Creates tenant profiles, family member records, and occupancy history.
*/

-- =============================================
-- TENANTS
-- =============================================
CREATE SEQUENCE IF NOT EXISTS tenant_code_seq START 1001;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_code text UNIQUE NOT NULL DEFAULT ('TEN-' || nextval('tenant_code_seq')::text),
  full_name text NOT NULL,
  photo_url text,
  national_id text,
  phone text NOT NULL,
  email text NOT NULL,
  gender text CHECK (gender IN ('Male', 'Female', 'Other')),
  house_id uuid REFERENCES houses(id) ON DELETE SET NULL,
  move_in_date date,
  move_out_date date,
  monthly_rent numeric(12,2),
  security_deposit numeric(12,2),
  num_family_members integer NOT NULL DEFAULT 0,
  car_make text,
  car_model text,
  car_registration text,
  car_color text,
  emergency_contact_name text,
  emergency_contact_phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacated', 'blacklisted')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gk_tenant_select_tenants" ON tenants;
CREATE POLICY "admin_gk_tenant_select_tenants" ON tenants FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'gatekeeper'))
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "admin_insert_tenants" ON tenants;
CREATE POLICY "admin_insert_tenants" ON tenants FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_tenants" ON tenants;
CREATE POLICY "admin_update_tenants" ON tenants FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "admin_delete_tenants" ON tenants;
CREATE POLICY "admin_delete_tenants" ON tenants FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_tenants_house_id ON tenants(house_id);
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- =============================================
-- TENANT FAMILY
-- =============================================
CREATE TABLE IF NOT EXISTS tenant_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tenant_family ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_tenant_select_family" ON tenant_family;
CREATE POLICY "admin_tenant_select_family" ON tenant_family FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_family" ON tenant_family;
CREATE POLICY "admin_insert_family" ON tenant_family FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_family" ON tenant_family;
CREATE POLICY "admin_update_family" ON tenant_family FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_family" ON tenant_family;
CREATE POLICY "admin_delete_family" ON tenant_family FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================
-- OCCUPANCIES
-- =============================================
CREATE TABLE IF NOT EXISTS occupancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id uuid NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  check_in_date date NOT NULL,
  check_out_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacated', 'transferred')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE occupancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_tenant_select_occupancies" ON occupancies;
CREATE POLICY "admin_tenant_select_occupancies" ON occupancies FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_occupancies" ON occupancies;
CREATE POLICY "admin_insert_occupancies" ON occupancies FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_occupancies" ON occupancies;
CREATE POLICY "admin_update_occupancies" ON occupancies FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_occupancies" ON occupancies;
CREATE POLICY "admin_delete_occupancies" ON occupancies FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_occupancies_house_id ON occupancies(house_id);
CREATE INDEX IF NOT EXISTS idx_occupancies_tenant_id ON occupancies(tenant_id);
