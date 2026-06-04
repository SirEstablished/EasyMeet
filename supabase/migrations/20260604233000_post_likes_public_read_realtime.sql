-- Allow everyone to read post_likes so like counts are visible to all users
DROP POLICY IF EXISTS "Post likes are viewable by everyone" ON public.post_likes;
CREATE POLICY "Post likes are viewable by everyone"
  ON public.post_likes FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.post_likes TO anon, authenticated;

-- Enable realtime broadcasts on post_likes
ALTER TABLE public.post_likes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_likes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes';
  END IF;
END$$;
