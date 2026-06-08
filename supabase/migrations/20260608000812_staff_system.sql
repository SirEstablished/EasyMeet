-- Staff System: invites, profile fields, subscriptions

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_business_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_commission_pct numeric,
  ADD COLUMN IF NOT EXISTS staff_subscription_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_subscription_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_staff_business_id ON public.profiles(staff_business_id);

CREATE TABLE IF NOT EXISTS public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  commission_pct numeric NOT NULL DEFAULT 0,
  invite_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_business_id ON public.staff_invites(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_invites_code ON public.staff_invites(invite_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites TO authenticated;
GRANT SELECT, UPDATE ON public.staff_invites TO anon;
GRANT ALL ON public.staff_invites TO service_role;

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_invites: business owner manage" ON public.staff_invites;
CREATE POLICY "staff_invites: business owner manage"
ON public.staff_invites FOR ALL TO authenticated
USING (business_id = auth.uid())
WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "staff_invites: lookup by code" ON public.staff_invites;
CREATE POLICY "staff_invites: lookup by code"
ON public.staff_invites FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "staff_invites: accept update" ON public.staff_invites;
CREATE POLICY "staff_invites: accept update"
ON public.staff_invites FOR UPDATE TO anon, authenticated
USING (status = 'pending' AND expires_at > now())
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.staff_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paystack_ref text,
  amount numeric NOT NULL DEFAULT 1000,
  paid_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_staff_id ON public.staff_subscriptions(staff_id);

GRANT SELECT, INSERT ON public.staff_subscriptions TO authenticated;
GRANT ALL ON public.staff_subscriptions TO service_role;

ALTER TABLE public.staff_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_subscriptions: self read" ON public.staff_subscriptions;
CREATE POLICY "staff_subscriptions: self read"
ON public.staff_subscriptions FOR SELECT TO authenticated
USING (staff_id = auth.uid());

DROP POLICY IF EXISTS "staff_subscriptions: self insert" ON public.staff_subscriptions;
CREATE POLICY "staff_subscriptions: self insert"
ON public.staff_subscriptions FOR INSERT TO authenticated
WITH CHECK (staff_id = auth.uid());

-- Storage bucket for KYC uploads (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-kyc', 'staff-kyc', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff-kyc: owner upload" ON storage.objects;
CREATE POLICY "staff-kyc: owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'staff-kyc' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "staff-kyc: owner read" ON storage.objects;
CREATE POLICY "staff-kyc: owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'staff-kyc' AND (auth.uid())::text = (storage.foldername(name))[1]);
