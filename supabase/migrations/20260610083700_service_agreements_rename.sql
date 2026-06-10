-- Align service_agreements columns with canonical names used by the app.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_agreements' AND column_name='professional_id') THEN
    ALTER TABLE public.service_agreements RENAME COLUMN professional_id TO sender_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_agreements' AND column_name='customer_id') THEN
    ALTER TABLE public.service_agreements RENAME COLUMN customer_id TO receiver_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_agreements' AND column_name='title') THEN
    ALTER TABLE public.service_agreements RENAME COLUMN title TO job_title;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_agreements' AND column_name='description') THEN
    ALTER TABLE public.service_agreements RENAME COLUMN description TO job_description;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_agreements' AND column_name='price_ngn') THEN
    ALTER TABLE public.service_agreements RENAME COLUMN price_ngn TO price;
  END IF;
END $$;

ALTER TABLE public.service_agreements ALTER COLUMN job_title SET NOT NULL;
ALTER TABLE public.service_agreements ALTER COLUMN price SET NOT NULL;

DROP POLICY IF EXISTS "agreements parties read" ON public.service_agreements;
CREATE POLICY "agreements parties read" ON public.service_agreements
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "agreements professional insert" ON public.service_agreements;
DROP POLICY IF EXISTS "agreements sender insert" ON public.service_agreements;
CREATE POLICY "agreements sender insert" ON public.service_agreements
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "agreements parties update" ON public.service_agreements;
CREATE POLICY "agreements parties update" ON public.service_agreements
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());
