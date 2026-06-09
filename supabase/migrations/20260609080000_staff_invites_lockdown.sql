-- Tighten staff_invites RLS and expose a narrow public lookup RPC.

DROP POLICY IF EXISTS "staff_invites: lookup by code" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites: accept update" ON public.staff_invites;

REVOKE SELECT, UPDATE ON public.staff_invites FROM anon;

CREATE POLICY "staff_invites: accept update"
ON public.staff_invites FOR UPDATE TO authenticated
USING (status = 'pending' AND expires_at > now())
WITH CHECK (
  status IN ('pending','accepted')
  AND accepted_by = auth.uid()
);

CREATE OR REPLACE FUNCTION public.get_staff_invite_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  full_name text,
  email text,
  commission_pct numeric,
  status text,
  expires_at timestamptz,
  business_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.business_id, i.full_name, i.email, i.commission_pct,
         i.status, i.expires_at,
         p.full_name AS business_name
  FROM public.staff_invites i
  LEFT JOIN public.profiles p ON p.id = i.business_id
  WHERE i.invite_code = p_code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_staff_invite_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_staff_invite_by_code(text) TO anon, authenticated;
