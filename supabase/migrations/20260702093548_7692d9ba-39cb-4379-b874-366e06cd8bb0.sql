
-- 1. Guard INSERTs: only trusted server roles may pre-set financial / status fields.
CREATE OR REPLACE FUNCTION public.guard_orders_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role / postgres (server functions & RPCs) to insert anything.
  IF current_setting('request.jwt.claim.role', true) IN ('service_role') THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- For end-user inserts, force safe defaults for sensitive fields.
  -- The buyer cannot self-mark an order as paid, set commission/payout,
  -- inject a payment reference, or seed escrow state.
  NEW.payment_status := 'pending';
  NEW.payment_ref := NULL;
  NEW.status := COALESCE(NULLIF(NEW.status, ''), 'pending');
  NEW.escrow_status := NULL;
  NEW.escrow_stage := NULL;
  NEW.commission_amount := 0;
  NEW.payout_amount := 0;

  -- customer_id must be the authenticated user (RLS already enforces this,
  -- but re-assert here so triggers cannot be side-stepped by future policy edits).
  IF NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'customer_id must match the authenticated user';
  END IF;

  -- Basic sanity on amount / currency so a buyer cannot insert a bogus
  -- negative amount or unusual currency at rest.
  IF NEW.amount IS NULL OR NEW.amount < 0 THEN
    RAISE EXCEPTION 'amount must be a non-negative number';
  END IF;
  IF NEW.currency IS NULL OR NEW.currency = '' THEN
    NEW.currency := 'NGN';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_orders_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_orders_insert_trg ON public.orders;
CREATE TRIGGER guard_orders_insert_trg
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_orders_insert();

-- 2. Attach the existing UPDATE guard (function already exists) so buyers /
--    providers cannot mutate payment_status, escrow_status, amount, etc.
DROP TRIGGER IF EXISTS prevent_orders_financial_field_update_trg ON public.orders;
CREATE TRIGGER prevent_orders_financial_field_update_trg
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_orders_financial_field_update();
