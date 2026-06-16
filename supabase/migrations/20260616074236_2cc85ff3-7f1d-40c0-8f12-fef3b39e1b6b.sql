CREATE OR REPLACE FUNCTION public.release_escrow_payment(p_escrow_id uuid, p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escrow RECORD;
  v_order RECORD;
  v_labor numeric;
  v_amount numeric;
  v_commission numeric;
  v_payout numeric;
BEGIN
  SELECT * INTO v_escrow FROM public.escrow WHERE id = p_escrow_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_escrow.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the customer can release this payment';
  END IF;
  IF v_escrow.status = 'released' THEN
    RETURN jsonb_build_object('ok', true, 'already_released', true);
  END IF;
  IF v_escrow.status <> 'holding' THEN
    RAISE EXCEPTION 'Escrow is not in a releasable state';
  END IF;

  v_amount := COALESCE(v_escrow.amount_ngn, v_escrow.amount, v_order.amount, 0);
  v_labor := COALESCE(v_escrow.labor_amount, v_amount);
  v_commission := CASE WHEN v_labor >= 5000 THEN round(v_labor * 0.03 * 100) / 100 ELSE 0 END;
  v_payout := round((v_amount - v_commission) * 100) / 100;

  UPDATE public.escrow
  SET status = 'released',
      stage = 'completed',
      commission_amount = v_commission,
      payout_amount = v_payout,
      released_at = now()
  WHERE id = p_escrow_id;

  UPDATE public.orders
  SET status = 'completed',
      escrow_status = 'released',
      escrow_stage = 'completed',
      commission_amount = v_commission,
      payout_amount = v_payout
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'commission', v_commission, 'payout', v_payout);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) TO authenticated;