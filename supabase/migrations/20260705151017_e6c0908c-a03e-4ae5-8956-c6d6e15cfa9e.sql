
-- Ensure roles infra
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric NOT NULL DEFAULT 0,
  escrow_balance numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  lifetime_earnings numeric NOT NULL DEFAULT 0,
  auto_withdrawal boolean NOT NULL DEFAULT false,
  auto_withdrawal_threshold numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets self read" ON public.wallets;
CREATE POLICY "wallets self read" ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "wallets self update settings" ON public.wallets;
CREATE POLICY "wallets self update settings" ON public.wallets FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.wallets_guard_financials()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('postgres','supabase_admin','service_role') THEN
    NEW.updated_at = now(); RETURN NEW;
  END IF;
  IF NEW.available_balance IS DISTINCT FROM OLD.available_balance
     OR NEW.escrow_balance IS DISTINCT FROM OLD.escrow_balance
     OR NEW.total_withdrawn IS DISTINCT FROM OLD.total_withdrawn
     OR NEW.lifetime_earnings IS DISTINCT FROM OLD.lifetime_earnings
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Wallet balances can only be modified by trusted server processes';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wallets_guard_financials_trg ON public.wallets;
CREATE TRIGGER wallets_guard_financials_trg BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.wallets_guard_financials();

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','withdrawal','refund','commission')),
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  reference_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions(user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_tx self read" ON public.wallet_transactions;
CREATE POLICY "wallet_tx self read" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 1000),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  rejection_reason text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  paystack_transfer_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx ON public.withdrawal_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON public.withdrawal_requests(status, created_at DESC);
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "withdrawal self read" ON public.withdrawal_requests;
CREATE POLICY "withdrawal self read" ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));
DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.credit_wallet_after_release(
  p_user_id uuid, p_amount numeric, p_commission numeric,
  p_order_id uuid, p_escrow_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payout numeric; v_new_balance numeric;
BEGIN
  v_payout := round((COALESCE(p_amount,0) - COALESCE(p_commission,0)) * 100) / 100;
  INSERT INTO public.wallets(user_id, available_balance, lifetime_earnings)
    VALUES (p_user_id, v_payout, v_payout)
  ON CONFLICT (user_id) DO UPDATE
    SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
        lifetime_earnings = public.wallets.lifetime_earnings + EXCLUDED.lifetime_earnings,
        updated_at = now()
  RETURNING available_balance INTO v_new_balance;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_after, reference_id, note)
    VALUES (p_user_id, 'credit', v_payout, v_new_balance, p_escrow_id,
            'Escrow release for order ' || COALESCE(p_order_id::text,''));
  RETURN jsonb_build_object('ok', true, 'payout', v_payout, 'balance', v_new_balance);
END $$;
GRANT EXECUTE ON FUNCTION public.credit_wallet_after_release(uuid,numeric,numeric,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_escrow_payment(p_escrow_id uuid, p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_escrow RECORD; v_order RECORD; v_labor numeric; v_amount numeric; v_commission numeric; v_payout numeric;
BEGIN
  SELECT * INTO v_escrow FROM public.escrow WHERE id = p_escrow_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escrow not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_escrow.customer_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
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
  UPDATE public.escrow SET status='released', stage='completed',
    commission_amount=v_commission, payout_amount=v_payout, released_at=now()
    WHERE id = p_escrow_id;
  UPDATE public.orders SET status='completed', escrow_status='released', escrow_stage='completed',
    commission_amount=v_commission, payout_amount=v_payout WHERE id = p_order_id;
  PERFORM public.credit_wallet_after_release(v_escrow.professional_id, v_amount, v_commission, p_order_id, p_escrow_id);
  RETURN jsonb_build_object('ok', true, 'commission', v_commission, 'payout', v_payout);
END; $function$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric, p_bank_name text, p_account_number text, p_account_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_balance numeric; v_new_balance numeric; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount < 1000 THEN RAISE EXCEPTION 'Minimum withdrawal is NGN 1000'; END IF;
  SELECT available_balance INTO v_balance FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  UPDATE public.wallets
    SET available_balance = available_balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = now()
    WHERE user_id = v_uid
    RETURNING available_balance INTO v_new_balance;
  INSERT INTO public.withdrawal_requests(user_id, amount, bank_name, account_number, account_name)
    VALUES (v_uid, p_amount, p_bank_name, p_account_number, p_account_name)
    RETURNING id INTO v_id;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_after, reference_id, note)
    VALUES (v_uid, 'withdrawal', p_amount, v_new_balance, v_id, 'Withdrawal request to ' || p_bank_name);
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'balance', v_new_balance);
END $$;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(p_withdrawal_id uuid, p_transfer_ref text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid,'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.withdrawal_requests
    SET status='completed', processed_by=v_uid, processed_at=now(), paystack_transfer_ref=p_transfer_ref
    WHERE id=p_withdrawal_id AND status IN ('pending','processing');
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_withdrawal(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(p_withdrawal_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_req RECORD; v_new_balance numeric;
BEGIN
  IF NOT public.has_role(v_uid,'admin'::public.app_role) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF v_req.status = 'rejected' THEN RETURN jsonb_build_object('ok', true, 'already_rejected', true); END IF;
  IF v_req.status = 'completed' THEN RAISE EXCEPTION 'Already completed'; END IF;
  UPDATE public.wallets
    SET available_balance = available_balance + v_req.amount,
        total_withdrawn = GREATEST(0, total_withdrawn - v_req.amount),
        updated_at = now()
    WHERE user_id = v_req.user_id
    RETURNING available_balance INTO v_new_balance;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_after, reference_id, note)
    VALUES (v_req.user_id, 'refund', v_req.amount, v_new_balance, v_req.id,
            'Withdrawal rejected: ' || COALESCE(p_reason,''));
  UPDATE public.withdrawal_requests
    SET status='rejected', rejection_reason=p_reason, processed_by=v_uid, processed_at=now()
    WHERE id=p_withdrawal_id;
  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(uuid,text) TO authenticated;
