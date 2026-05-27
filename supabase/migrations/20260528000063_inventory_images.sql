-- Varastorivien pienet kuvat (storage-polku).

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS image_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-images',
  'inventory-images',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.inventory_image_company_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_read_inventory_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_read_module(public.inventory_image_company_id(object_name), 'inventory');
$$;

CREATE OR REPLACE FUNCTION public.can_write_inventory_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_write_module(public.inventory_image_company_id(object_name), 'inventory');
$$;

DROP POLICY IF EXISTS inventory_images_select ON storage.objects;
CREATE POLICY inventory_images_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'inventory-images'
    AND public.can_read_inventory_image(name)
  );

DROP POLICY IF EXISTS inventory_images_insert ON storage.objects;
CREATE POLICY inventory_images_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'inventory-images'
    AND public.can_write_inventory_image(name)
  );

DROP POLICY IF EXISTS inventory_images_update ON storage.objects;
CREATE POLICY inventory_images_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'inventory-images'
    AND public.can_write_inventory_image(name)
  );

DROP POLICY IF EXISTS inventory_images_delete ON storage.objects;
CREATE POLICY inventory_images_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'inventory-images'
    AND public.can_write_inventory_image(name)
  );
