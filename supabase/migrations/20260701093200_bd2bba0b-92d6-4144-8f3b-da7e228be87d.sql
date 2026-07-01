
CREATE OR REPLACE FUNCTION public.prevent_orders_financial_field_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role and postgres to update anything (server functions / RPCs)
  IF current_setting('request.jwt.claim.role', true) IN ('service_role') THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
     OR NEW.escrow_status IS DISTINCT FROM OLD.escrow_status
     OR NEW.escrow_stage IS DISTINCT FROM OLD.escrow_stage
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.payout_amount IS DISTINCT FROM OLD.payout_amount
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
  THEN
    RAISE EXCEPTION 'Financial and identity fields on orders can only be modified by trusted server processes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_prevent_financial_update ON public.orders;
CREATE TRIGGER orders_prevent_financial_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_orders_financial_field_update();
