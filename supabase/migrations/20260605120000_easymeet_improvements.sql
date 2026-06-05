-- EasyMeet improvements: geo on profiles, gold tick criteria, bans,
-- verification_requests table, verification-docs bucket.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.evaluate_gold_tick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  complete boolean;
BEGIN
  IF TG_TABLE_NAME = 'reviews' THEN
    SELECT * INTO p FROM public.profiles WHERE id = NEW.professional_id;
  ELSE
    p := NEW;
  END IF;

  IF p.id IS NULL THEN RETURN NEW; END IF;

  complete := (
    coalesce(length(trim(p.full_name)), 0) > 0
    AND coalesce(length(trim(p.username)), 0) > 0
    AND coalesce(length(trim(p.bio)), 0) > 0
    AND coalesce(length(trim(p.location)), 0) > 0
    AND coalesce(length(trim(p.phone)), 0) > 0
    AND coalesce(length(trim(p.avatar_url)), 0) > 0
  );

  IF p.avg_rating >= 4.8
     AND p.review_count >= 50
     AND p.created_at <= now() - interval '6 months'
     AND coalesce(p.is_banned, false) = false
     AND complete THEN
    UPDATE public.profiles SET gold_tick = true WHERE id = p.id AND gold_tick = false;
  ELSE
    UPDATE public.profiles SET gold_tick = false WHERE id = p.id AND gold_tick = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_gold_tick ON public.reviews;
CREATE TRIGGER trg_award_gold_tick
AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.evaluate_gold_tick();

DROP TRIGGER IF EXISTS trg_award_gold_tick_profile ON public.profiles;
CREATE TRIGGER trg_award_gold_tick_profile
AFTER UPDATE OF avg_rating, review_count, is_banned, full_name, username, bio, location, phone, avatar_url
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.evaluate_gold_tick();

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tick_type text NOT NULL CHECK (tick_type IN ('blue', 'white')),
  document_urls text[] NOT NULL DEFAULT '{}',
  business_name text,
  registration_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own verification requests" ON public.verification_requests;
CREATE POLICY "Users view own verification requests"
  ON public.verification_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own verification requests" ON public.verification_requests;
CREATE POLICY "Users insert own verification requests"
  ON public.verification_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Verification docs: owner read" ON storage.objects;
CREATE POLICY "Verification docs: owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Verification docs: owner write" ON storage.objects;
CREATE POLICY "Verification docs: owner write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
