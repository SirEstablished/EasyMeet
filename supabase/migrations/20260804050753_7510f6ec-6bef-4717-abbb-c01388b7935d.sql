CREATE POLICY "digital-products owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'digital-products'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "digital-products admin read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'digital-products'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);