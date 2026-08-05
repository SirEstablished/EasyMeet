DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','messages','service_agreements','escrow'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated';
    EXECUTE 'GRANT ALL ON public.conversations TO service_role';
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "conversations participants read" ON public.conversations';
      EXECUTE 'CREATE POLICY "conversations participants read" ON public.conversations
               FOR SELECT TO authenticated
               USING (user_a = auth.uid() OR user_b = auth.uid())';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated';
    EXECUTE 'GRANT ALL ON public.messages TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "messages participants read" ON public.messages';
    EXECUTE 'CREATE POLICY "messages participants read" ON public.messages
             FOR SELECT TO authenticated
             USING (EXISTS (
               SELECT 1 FROM public.conversations c
               WHERE c.id = messages.conversation_id
                 AND (c.user_a = auth.uid() OR c.user_b = auth.uid())))';
    EXECUTE 'DROP POLICY IF EXISTS "messages participants update" ON public.messages';
    EXECUTE 'CREATE POLICY "messages participants update" ON public.messages
             FOR UPDATE TO authenticated
             USING (EXISTS (
               SELECT 1 FROM public.conversations c
               WHERE c.id = messages.conversation_id
                 AND (c.user_a = auth.uid() OR c.user_b = auth.uid())))
             WITH CHECK (EXISTS (
               SELECT 1 FROM public.conversations c
               WHERE c.id = messages.conversation_id
                 AND (c.user_a = auth.uid() OR c.user_b = auth.uid())))';
  END IF;

  IF to_regclass('public.service_agreements') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.service_agreements TO authenticated';
    EXECUTE 'GRANT ALL ON public.service_agreements TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "agreements parties read" ON public.service_agreements';
    EXECUTE 'CREATE POLICY "agreements parties read" ON public.service_agreements
             FOR SELECT TO authenticated
             USING (sender_id = auth.uid() OR receiver_id = auth.uid()
                    OR EXISTS (
                      SELECT 1 FROM public.conversations c
                      WHERE c.id = service_agreements.conversation_id
                        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())))';
  END IF;
END $$;