UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf']
WHERE id = 'identity-documents';
