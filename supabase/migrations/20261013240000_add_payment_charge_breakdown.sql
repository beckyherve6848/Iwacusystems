ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rent_paid_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (rent_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS water_due_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (water_due_amount >= 0),
  ADD COLUMN IF NOT EXISTS electricity_due_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (electricity_due_amount >= 0),
  ADD COLUMN IF NOT EXISTS water_paid_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (water_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS electricity_paid_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (electricity_paid_amount >= 0);

UPDATE public.payments
SET rent_paid_amount = amount_paid
WHERE rent_paid_amount = 0 AND amount_paid > 0;

ALTER TABLE public.payments DROP COLUMN IF EXISTS balance;
ALTER TABLE public.payments
  ADD COLUMN balance numeric(12, 2)
    GENERATED ALWAYS AS (amount_due - rent_paid_amount) STORED;

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
  paid_amount numeric(12, 2);
BEGIN
  SELECT COALESCE(SUM(payment.rent_paid_amount), 0)
  INTO paid_amount
  FROM public.payments AS payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.rent_month >= date_trunc('month', p_rent_month)::date
    AND payment.rent_month < (date_trunc('month', p_rent_month) + interval '1 month')::date;

  UPDATE public.utility_invoices AS invoice
  SET
    rent_paid_amount = paid_amount,
    status = CASE
      WHEN paid_amount >= invoice.rent_amount THEN 'paid'
      WHEN paid_amount > 0 THEN 'partial'
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
  AFTER INSERT OR UPDATE OF tenant_id, rent_month, rent_paid_amount OR DELETE
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_after_payment_change();

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
