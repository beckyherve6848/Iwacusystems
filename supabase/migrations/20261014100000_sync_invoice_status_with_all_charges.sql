CREATE OR REPLACE FUNCTION public.sync_invoice_rent_payment_status(
  p_tenant_id uuid,
  p_rent_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rent_paid numeric(12, 2);
  water_paid numeric(12, 2);
  electricity_paid numeric(12, 2);
BEGIN
  SELECT
    COALESCE(SUM(payment.rent_paid_amount), 0),
    COALESCE(SUM(payment.water_paid_amount), 0),
    COALESCE(SUM(payment.electricity_paid_amount), 0)
  INTO rent_paid, water_paid, electricity_paid
  FROM public.payments AS payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.rent_month >= date_trunc('month', p_rent_month)::date
    AND payment.rent_month < (date_trunc('month', p_rent_month) + interval '1 month')::date;

  UPDATE public.utility_invoices AS invoice
  SET
    rent_paid_amount = rent_paid,
    status = CASE
      WHEN rent_paid >= invoice.rent_amount
        AND water_paid >= invoice.water_amount
        AND electricity_paid >= invoice.electricity_amount THEN 'paid'
      WHEN rent_paid > 0 OR water_paid > 0 OR electricity_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    updated_at = now()
  WHERE invoice.tenant_id = p_tenant_id
    AND invoice.rent_month >= date_trunc('month', p_rent_month)::date
    AND invoice.rent_month < (date_trunc('month', p_rent_month) + interval '1 month')::date;
END;
$$;

DROP TRIGGER IF EXISTS sync_utility_invoice_after_payment_change ON public.payments;
CREATE TRIGGER sync_utility_invoice_after_payment_change
  AFTER INSERT OR UPDATE OF tenant_id, rent_month, rent_paid_amount, water_paid_amount, electricity_paid_amount OR DELETE
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_after_payment_change();

DROP TRIGGER IF EXISTS sync_invoice_after_invoice_change ON public.utility_invoices;
CREATE TRIGGER sync_invoice_after_invoice_change
  AFTER INSERT OR UPDATE OF tenant_id, rent_month, rent_amount, water_amount, electricity_amount
  ON public.utility_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_after_invoice_change();

DROP POLICY IF EXISTS "tenant_read_own_utility_invoices" ON public.utility_invoices;
CREATE POLICY "tenant_read_own_utility_invoices" ON public.utility_invoices
  FOR SELECT TO authenticated
  USING (
    status IN ('unpaid', 'partial')
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.id = utility_invoices.tenant_id
        AND tenant.user_id = (SELECT auth.uid())
        AND public.current_app_role() = 'tenant'
    )
  );

DO $$
DECLARE
  invoice_record record;
BEGIN
  FOR invoice_record IN
    SELECT tenant_id, rent_month
    FROM public.utility_invoices
  LOOP
    PERFORM public.sync_invoice_rent_payment_status(invoice_record.tenant_id, invoice_record.rent_month);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
