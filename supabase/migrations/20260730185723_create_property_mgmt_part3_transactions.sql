/*
# Property Management System - Part 3: Payments, Agreements, Maintenance, Visitors, Notifications, Settings
*/

-- =============================================
-- PAYMENTS
-- =============================================
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 10001;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE NOT NULL DEFAULT ('RCP-' || nextval('receipt_number_seq')::text),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  house_id uuid NOT NULL REFERENCES houses(id) ON DELETE RESTRICT,
  rent_month date NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  amount_due numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
  late_fee numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('cash', 'bank_deposit', 'bank_transfer', 'mobile_money')),
  payment_proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue')),
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_tenant_select_payments" ON payments;
CREATE POLICY "admin_tenant_select_payments" ON payments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_payments" ON payments;
CREATE POLICY "admin_insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_payments" ON payments;
CREATE POLICY "admin_update_payments" ON payments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_payments" ON payments;
CREATE POLICY "admin_delete_payments" ON payments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_house_id ON payments(house_id);
CREATE INDEX IF NOT EXISTS idx_payments_rent_month ON payments(rent_month);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- =============================================
-- RENTAL AGREEMENTS
-- =============================================
CREATE SEQUENCE IF NOT EXISTS agreement_number_seq START 2001;

CREATE TABLE IF NOT EXISTS rental_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number text UNIQUE NOT NULL DEFAULT ('AGR-' || nextval('agreement_number_seq')::text),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  house_id uuid NOT NULL REFERENCES houses(id) ON DELETE RESTRICT,
  lease_start_date date NOT NULL,
  lease_end_date date,
  monthly_rent numeric(12,2) NOT NULL,
  security_deposit numeric(12,2) NOT NULL DEFAULT 0,
  terms_and_conditions text,
  landlord_signature text,
  tenant_signature text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_tenant_select_agreements" ON rental_agreements;
CREATE POLICY "admin_tenant_select_agreements" ON rental_agreements FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_agreements" ON rental_agreements;
CREATE POLICY "admin_insert_agreements" ON rental_agreements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_agreements" ON rental_agreements;
CREATE POLICY "admin_update_agreements" ON rental_agreements FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_delete_agreements" ON rental_agreements;
CREATE POLICY "admin_delete_agreements" ON rental_agreements FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================
-- MAINTENANCE REQUESTS
-- =============================================
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'rejected')),
  assigned_to text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_tenant_select_maintenance" ON maintenance_requests;
CREATE POLICY "admin_tenant_select_maintenance" ON maintenance_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_tenant_insert_maintenance" ON maintenance_requests;
CREATE POLICY "admin_tenant_insert_maintenance" ON maintenance_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_maintenance" ON maintenance_requests;
CREATE POLICY "admin_update_maintenance" ON maintenance_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_delete_maintenance" ON maintenance_requests;
CREATE POLICY "admin_delete_maintenance" ON maintenance_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================
-- VISITORS
-- =============================================
CREATE TABLE IF NOT EXISTS visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL,
  phone text,
  national_id text,
  house_id uuid REFERENCES houses(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  vehicle_registration text,
  time_in timestamptz NOT NULL DEFAULT now(),
  time_out timestamptz,
  status text NOT NULL DEFAULT 'inside' CHECK (status IN ('inside', 'left')),
  registered_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gk_tenant_select_visitors" ON visitors;
CREATE POLICY "admin_gk_tenant_select_visitors" ON visitors FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'gatekeeper'))
    OR EXISTS (SELECT 1 FROM tenants WHERE tenants.id = tenant_id AND tenants.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_gk_insert_visitors" ON visitors;
CREATE POLICY "admin_gk_insert_visitors" ON visitors FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'gatekeeper'))
  );

DROP POLICY IF EXISTS "admin_gk_update_visitors" ON visitors;
CREATE POLICY "admin_gk_update_visitors" ON visitors FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'gatekeeper'))
  );

DROP POLICY IF EXISTS "admin_delete_visitors" ON visitors;
CREATE POLICY "admin_delete_visitors" ON visitors FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_visitors_time_in ON visitors(time_in);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_notifications" ON notifications;
CREATE POLICY "users_select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_system_insert_notifications" ON notifications;
CREATE POLICY "admin_system_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "users_update_own_notifications" ON notifications;
CREATE POLICY "users_update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_notifications" ON notifications;
CREATE POLICY "users_delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- =============================================
-- SETTINGS
-- =============================================
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  label text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_settings" ON settings;
CREATE POLICY "authenticated_select_settings" ON settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_settings" ON settings;
CREATE POLICY "admin_insert_settings" ON settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_settings" ON settings;
CREATE POLICY "admin_update_settings" ON settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_settings" ON settings;
CREATE POLICY "admin_delete_settings" ON settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

INSERT INTO settings (key, value, label) VALUES
  ('property_name', 'My Property', 'Property Name'),
  ('property_address', '', 'Property Address'),
  ('property_phone', '', 'Property Phone'),
  ('property_email', '', 'Property Email'),
  ('bank_name', '', 'Bank Name'),
  ('account_name', '', 'Account Name'),
  ('account_number', '', 'Account Number'),
  ('mobile_money_number', '', 'Mobile Money Number'),
  ('payment_reference', 'RENT', 'Payment Reference'),
  ('late_fee_amount', '500', 'Late Fee Amount'),
  ('late_fee_due_day', '5', 'Late Fee Grace Period (days)')
ON CONFLICT (key) DO NOTHING;
