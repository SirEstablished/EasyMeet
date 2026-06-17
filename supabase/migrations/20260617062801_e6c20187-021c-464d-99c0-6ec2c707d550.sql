
DO $$
BEGIN
  IF to_regclass('public.escrow') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.enforce_escrow_release_commission()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    DECLARE
      v_labor numeric;
      v_amount numeric;
      v_commission numeric;
      v_payout numeric;
    BEGIN
      IF NEW.status = 'released' AND (OLD.status IS DISTINCT FROM 'released') THEN
        v_amount := COALESCE(NEW.amount_ngn, NEW.amount, 0);
        v_labor := COALESCE(NEW.labor_amount, v_amount);
        v_commission := CASE WHEN v_labor >= 5000 THEN round(v_labor * 0.03 * 100) / 100 ELSE 0 END;
        v_payout := round((v_amount - v_commission) * 100) / 100;
        NEW.commission_amount := v_commission;
        NEW.payout_amount := v_payout;
        NEW.stage := 'completed';
        NEW.released_at := COALESCE(NEW.released_at, now());
      END IF;
      RETURN NEW;
    END;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS enforce_escrow_release_commission ON public.escrow';
    EXECUTE 'CREATE TRIGGER enforce_escrow_release_commission BEFORE UPDATE ON public.escrow FOR EACH ROW EXECUTE FUNCTION public.enforce_escrow_release_commission()';
  END IF;
END $$;

DROP POLICY IF EXISTS "digital-products owner insert" ON storage.objects;
CREATE POLICY "digital-products owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'digital-products'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "digital-products owner update" ON storage.objects;
CREATE POLICY "digital-products owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'digital-products'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'digital-products'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "digital-products owner delete" ON storage.objects;
CREATE POLICY "digital-products owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'digital-products'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='release_escrow_payment') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_escrow_payment(uuid, uuid) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='create_escrow_payment') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, uuid, numeric, text) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, uuid, numeric, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, uuid, numeric, text) TO authenticated';
  END IF;
END $$;
