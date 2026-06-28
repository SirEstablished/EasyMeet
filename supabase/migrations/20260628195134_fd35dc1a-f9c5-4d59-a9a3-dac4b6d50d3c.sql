DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['escrow','orders','service_agreements','notifications'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;