ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_reviews REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reviews';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
