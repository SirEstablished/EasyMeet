
-- 1) Lock down SECURITY DEFINER functions: revoke execute from PUBLIC and anon
REVOKE ALL ON FUNCTION public.credit_wallet_after_release(uuid, numeric, numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_after_release(uuid, numeric, numeric, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.prevent_orders_financial_field_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_orders_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallets_guard_financials() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_approve_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_withdrawal(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reject_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_escrow_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) TO authenticated, service_role;

-- 2) Add explicit admin-only DELETE policy on orders so delete access is intentional
CREATE POLICY "orders admin delete"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
