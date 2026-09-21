-- Työkaluinventaario: sarjanumero, hankinta, lainattavuus, hinnasto, kuvat, lainauksen odotettu paluu.

ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS purchased_at DATE,
  ADD COLUMN IF NOT EXISTS purchased_from TEXT,
  ADD COLUMN IF NOT EXISTS purchase_price_eur NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS is_loanable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_day_eur NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS rate_weekend_eur NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS rate_week_eur NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS rate_month_eur NUMERIC(12, 2);

COMMENT ON COLUMN tools.serial_number IS 'Sarjanumero (erillään RFID/tag_id-tunnisteesta).';
COMMENT ON COLUMN tools.purchased_at IS 'Hankintapäivä.';
COMMENT ON COLUMN tools.purchased_from IS 'Mistä hankittu (toimittaja / lähde).';
COMMENT ON COLUMN tools.purchase_price_eur IS 'Hankintahinta euroina.';
COMMENT ON COLUMN tools.is_loanable IS 'Onko työkalu lainattavissa. Jos false, lainaustoiminnot piilotetaan/estetään.';
COMMENT ON COLUMN tools.rate_day_eur IS 'Lainaushinta €/päivä.';
COMMENT ON COLUMN tools.rate_weekend_eur IS 'Lainaushinta €/viikonloppu.';
COMMENT ON COLUMN tools.rate_week_eur IS 'Lainaushinta €/viikko.';
COMMENT ON COLUMN tools.rate_month_eur IS 'Lainaushinta €/kk.';

ALTER TABLE tool_loans
  ADD COLUMN IF NOT EXISTS expected_return_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN tool_loans.expected_return_at IS
  'Suunniteltu / odotettu palautus (kalenteri ja varaukset). returned_at = todellinen paluu.';
COMMENT ON COLUMN tool_loans.notes IS 'Vapaaehtoinen lainaushuomio.';

CREATE TABLE IF NOT EXISTS tool_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_images_tool ON tool_images(tool_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tool_images_company ON tool_images(company_id);
CREATE INDEX IF NOT EXISTS idx_tool_loans_tool_range ON tool_loans(tool_id, loaned_at);

COMMENT ON TABLE tool_images IS 'Työkalun kuvat (storage-polku inventory-images -bucketissa, company_id/tools/...).';
COMMENT ON COLUMN tool_images.image_path IS 'Polku inventory-images -bucketissa, muoto company_id/tools/tool_id/image_id.jpg.';

ALTER TABLE tool_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tool_images_select ON tool_images;
CREATE POLICY tool_images_select ON tool_images FOR SELECT
  USING (
    company_id = public.current_company_id()
    OR public.can_read_module(company_id, 'tools')
  );

DROP POLICY IF EXISTS tool_images_write ON tool_images;
CREATE POLICY tool_images_write ON tool_images FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.can_write_module(company_id, 'tools')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.can_write_module(company_id, 'tools')
  );

-- Salli tools-moduulin kuvat samassa inventory-images -bucketissa (polku .../tools/...).
CREATE OR REPLACE FUNCTION public.can_read_inventory_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(split_part(object_name, '/', 2))
    WHEN 'tools' THEN public.can_read_module(public.inventory_image_company_id(object_name), 'tools')
    ELSE public.can_read_module(public.inventory_image_company_id(object_name), 'inventory')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_inventory_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(split_part(object_name, '/', 2))
    WHEN 'tools' THEN public.can_write_module(public.inventory_image_company_id(object_name), 'tools')
    ELSE public.can_write_module(public.inventory_image_company_id(object_name), 'inventory')
  END;
$$;
