CREATE SEQUENCE IF NOT EXISTS public.utility_invoice_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.utility_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE
    DEFAULT ('INV-' || nextval('public.utility_invoice_number_seq')::text),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE RESTRICT,
  rent_month date NOT NULL,
  rent_amount numeric(12, 2) NOT NULL CHECK (rent_amount >= 0),
  water_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (water_amount >= 0),
  electricity_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (electricity_amount >= 0),
  total_amount numeric(12, 2) NOT NULL CHECK (
    total_amount = rent_amount + water_amount + electricity_amount
  ),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rent_month)
);

ALTER TABLE public.utility_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_utility_invoices" ON public.utility_invoices;
CREATE POLICY "admin_manage_utility_invoices" ON public.utility_invoices
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "tenant_read_own_utility_invoices" ON public.utility_invoices;
CREATE POLICY "tenant_read_own_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.user_id = (SELECT auth.uid())
        AND public.current_app_role() = 'tenant'
    )
  );

CREATE INDEX IF NOT EXISTS idx_utility_invoices_tenant_month
  ON public.utility_invoices (tenant_id, rent_month DESC);
