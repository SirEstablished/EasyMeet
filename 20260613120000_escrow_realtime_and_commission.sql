-- Keep commission at zero until completion and publish escrow changes in real time.
CREATE OR REPLACE FUNCTION public.create_escrow_payment(
  p_conversation_id uuid,
  p_agreement_id uuid,
  p_customer_id uuid,
  p_provider_id uuid,
  p_amount numeric,
  p_payment_ref text
) RETURNS public.escrow
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.service_agreements%ROWTYPE;
  v_order_id uuid;
  v_escrow public.escrow%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_customer_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT * INTO v_agreement FROM public.service_agreements WHERE id = p_agreement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agreement not found'; END IF;

  INSERT INTO public.orders (
    customer_id, provider_id, product_id, service_id, kind, service_title, amount,
    commission_amount, currency, notes, payment_ref, payment_status, status
  ) VALUES (
    p_customer_id, p_provider_id, NULL, NULL, 'service', v_agreement.job_title, p_amount,
    0, 'NGN', v_agreement.job_description, p_payment_ref, 'paid', 'pending'
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.escrow (
    order_id, kind, customer_id, professional_id, conversation_id, agreement_id,
    title, amount_ngn, commission_amount, payout_amount, status,
    payment_ref, paystack_reference, paid_at
  ) VALUES (
    v_order_id, 'service', p_customer_id, p_provider_id, p_conversation_id, p_agreement_id,
    v_agreement.job_title, p_amount, 0, p_amount, 'holding',
    p_payment_ref, p_payment_ref, now()
  ) RETURNING * INTO v_escrow;

  BEGIN
    INSERT INTO public.notifications (user_id, recipient_id, sender_id, type, title, message, body, read)
    VALUES (
      p_provider_id, p_provider_id, p_customer_id, 'escrow_payment_received',
      'Payment held in escrow',
      'Payment of NGN ' || p_amount::text || ' for "' || v_agreement.job_title || '" is held in escrow. You can start the work.',
      'Payment of NGN ' || p_amount::text || ' for "' || v_agreement.job_title || '" is held in escrow. You can start the work.',
      false
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_escrow;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_escrow_payment(uuid,uuid,uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.keep_unreleased_escrow_commission_zero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('pending_payment', 'holding', 'in_progress', 'cancelled', 'refunded') THEN
    NEW.commission_amount := 0;
    NEW.payout_amount := NEW.amount_ngn;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_unreleased_escrow_commission_zero ON public.escrow;
CREATE TRIGGER trg_keep_unreleased_escrow_commission_zero
BEFORE INSERT OR UPDATE OF status, commission_amount, payout_amount ON public.escrow
FOR EACH ROW EXECUTE FUNCTION public.keep_unreleased_escrow_commission_zero();

ALTER TABLE public.escrow REPLICA IDENTITY FULL;
ALTER TABLE public.service_agreements REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.escrow;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.service_agreements;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;