-- Restrict SELECT to authenticated only (still public-readable via direct CDN URL because bucket.public=true)
DROP POLICY IF EXISTS "Public read reward images" ON storage.objects;

CREATE POLICY "Authenticated can list reward images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reward-images');