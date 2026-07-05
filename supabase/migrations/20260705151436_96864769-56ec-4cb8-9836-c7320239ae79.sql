
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_after_release(uuid, numeric, numeric, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_approve_withdrawal(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_withdrawal(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) FROM PUBLIC, anon;
-- Ensure trusted-server-only functions are not authenticated-callable
REVOKE EXECUTE ON FUNCTION public.credit_wallet_after_release(uuid, numeric, numeric, uuid, uuid) FROM authenticated;
