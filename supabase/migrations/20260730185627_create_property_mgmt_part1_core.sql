/*
# Property Management System - Part 1: Core Tables (profiles, house_categories, houses)

Creates the foundational tables that other tables depend on.
- profiles: extends auth.users with role and contact info
- house_categories: lookup for room types
- houses: all rental units
*/

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  photo_url text,
  role text NOT NULL DEFAULT 'tenant' CHECK (role IN ('admin', 'gatekeeper', 'tenant')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_profiles" ON profiles;
CREATE POLICY "users_select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "users_insert_own_profile" ON profiles;
CREATE POLICY "users_insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- =============================================
-- HOUSE CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS house_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE house_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_house_categories" ON house_categories;
CREATE POLICY "authenticated_select_house_categories" ON house_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_house_categories" ON house_categories;
CREATE POLICY "admin_insert_house_categories" ON house_categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_house_categories" ON house_categories;
CREATE POLICY "admin_update_house_categories" ON house_categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_house_categories" ON house_categories;
CREATE POLICY "admin_delete_house_categories" ON house_categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

INSERT INTO house_categories (name, description) VALUES
  ('Single Room', 'Single room unit'),
  ('Bedsitter', 'Bedsitter unit'),
  ('One Bedroom', 'One bedroom apartment'),
  ('Two Bedroom', 'Two bedroom apartment'),
  ('Three Bedroom', 'Three bedroom apartment'),
  ('Four Bedroom', 'Four bedroom apartment')
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- HOUSES
-- =============================================
CREATE TABLE IF NOT EXISTS houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_number text NOT NULL UNIQUE,
  block_wing text,
  floor text,
  category_id uuid REFERENCES house_categories(id),
  monthly_rent numeric(12,2) NOT NULL DEFAULT 0,
  security_deposit numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'reserved', 'maintenance')),
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_houses" ON houses;
CREATE POLICY "authenticated_select_houses" ON houses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_houses" ON houses;
CREATE POLICY "admin_insert_houses" ON houses FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_houses" ON houses;
CREATE POLICY "admin_update_houses" ON houses FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_houses" ON houses;
CREATE POLICY "admin_delete_houses" ON houses FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_houses_status ON houses(status);
