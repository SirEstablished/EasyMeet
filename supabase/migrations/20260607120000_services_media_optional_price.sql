-- Services: optional price + media gallery support

ALTER TABLE public.services
  ALTER COLUMN price DROP NOT NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

-- service-media bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-media', 'service-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Service media: public read" ON storage.objects;
CREATE POLICY "Service media: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'service-media');

DROP POLICY IF EXISTS "Service media: owner write" ON storage.objects;
CREATE POLICY "Service media: owner write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'service-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Service media: owner update" ON storage.objects;
CREATE POLICY "Service media: owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'service-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Service media: owner delete" ON storage.objects;
CREATE POLICY "Service media: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'service-media' AND auth.uid()::text = (storage.foldername(name))[1]);
