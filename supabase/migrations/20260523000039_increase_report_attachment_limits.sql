-- Allow larger maintenance images and PDF attachments on work reports (Firestore import).

UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'
  ]
WHERE id = 'maintenance-report-images';

UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf'
  ]
WHERE id = 'work-report-images';
