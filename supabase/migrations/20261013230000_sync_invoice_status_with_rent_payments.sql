ALTER TABLE public.utility_invoices
  DROP CONSTRAINT IF EXISTS utility_invoices_status_check;

ALTER TABLE public.utility_invoices
  ADD CONSTRAINT utility_invoices_status_check
  CHECK (status IN ('unpaid', 'partial', 'paid'));

ALTER TABLE public.utility_invoices
  ADD COLUMN IF NOT EXISTS rent_paid_amount numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (rent_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS rent_balance numeric(12, 2)
    GENERATED ALWAYS AS (GREATEST(rent_amount - rent_paid_amount, 0)) STORED,
  ADD COLUMN IF NOT EXISTS rent_credit numeric(12, 2)
    GENERATED ALWAYS AS (GREATEST(rent_paid_amount - rent_amount, 0)) STORED;

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
  SELECT COALESCE(SUM(payment.amount_paid), 0)
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

REVOKE ALL ON FUNCTION public.sync_invoice_rent_payment_status(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_invoice_after_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.sync_invoice_rent_payment_status(OLD.tenant_id, OLD.rent_month);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.sync_invoice_rent_payment_status(NEW.tenant_id, NEW.rent_month);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_after_payment_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_utility_invoice_after_payment_change ON public.payments;
CREATE TRIGGER sync_utility_invoice_after_payment_change
  AFTER INSERT OR UPDATE OF tenant_id, rent_month, amount_paid OR DELETE
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_after_payment_change();

CREATE OR REPLACE FUNCTION public.sync_invoice_after_invoice_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_invoice_rent_payment_status(NEW.tenant_id, NEW.rent_month);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invoice_after_invoice_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_invoice_after_invoice_change ON public.utility_invoices;
CREATE TRIGGER sync_invoice_after_invoice_change
  AFTER INSERT OR UPDATE OF tenant_id, rent_month, rent_amount
  ON public.utility_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_after_invoice_change();

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
