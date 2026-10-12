/*
# Add Caretaker Role Support

1. Modified Tables
- `profiles`: Add 'caretaker' to the role CHECK constraint
- `profiles`: Add `assigned_property_id` column (nullable, links caretaker to a house/property)
- `profiles`: Add `assigned_property_name` column (nullable, text name of assigned property)

2. Modified Tables (visitors)
- `visitors`: Add `number_of_visitors` column (integer, default 1)
- `visitors`: Add `expected_departure` column (timestamptz, nullable)
- `visitors`: Add `notes` column (text, nullable)
- `visitors`: Add `visit_date` column (date, nullable)

3. Security
- No new tables created
- Existing RLS policies on profiles and visitors remain intact
- The 'caretaker' role is added to the existing CHECK constraint so profiles can have role='caretaker'
*/

-- Step 1: Update the profiles role CHECK constraint to include 'caretaker'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'gatekeeper'::text, 'tenant'::text, 'caretaker'::text]));

-- Step 2: Add assigned property columns to profiles (for caretaker role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'assigned_property_id') THEN
    ALTER TABLE profiles ADD COLUMN assigned_property_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'assigned_property_name') THEN
    ALTER TABLE profiles ADD COLUMN assigned_property_name text;
  END IF;
END $$;

-- Step 3: Add visitor fields for richer caretaker registration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visitors' AND column_name = 'number_of_visitors') THEN
    ALTER TABLE visitors ADD COLUMN number_of_visitors integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visitors' AND column_name = 'expected_departure') THEN
    ALTER TABLE visitors ADD COLUMN expected_departure timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visitors' AND column_name = 'notes') THEN
    ALTER TABLE visitors ADD COLUMN notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visitors' AND column_name = 'visit_date') THEN
    ALTER TABLE visitors ADD COLUMN visit_date date;
  END IF;
END $$;
