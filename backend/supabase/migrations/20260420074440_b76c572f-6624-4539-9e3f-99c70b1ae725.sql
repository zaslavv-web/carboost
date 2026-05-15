DROP POLICY IF EXISTS "Public read shop products" ON storage.objects;
-- Bucket остаётся public=true (превью отображаются по прямой ссылке через CDN),
-- но листинг через storage.objects API закрыт.