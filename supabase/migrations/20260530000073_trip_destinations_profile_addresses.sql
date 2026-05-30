-- Ajomatkat: käyttäjän lähtöosoitteet + yrityksen kohderekisteri (tukkurit).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS workplace_address TEXT,
  ADD COLUMN IF NOT EXISTS trip_departure_source TEXT NOT NULL DEFAULT 'workplace';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_trip_departure_source_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_trip_departure_source_check
  CHECK (trip_departure_source IN ('workplace', 'home'));

COMMENT ON COLUMN profiles.home_address IS 'Kotiosoite työmatkojen lähtöpisteeksi';
COMMENT ON COLUMN profiles.workplace_address IS 'Toimipisteen osoite työmatkojen lähtöpisteeksi';
COMMENT ON COLUMN profiles.trip_departure_source IS 'workplace | home — kumpaa käytetään oletuksena lähtönä';

CREATE TABLE IF NOT EXISTS trip_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'supplier',
  supplier_key TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_destinations_category_check CHECK (category IN ('supplier', 'custom'))
);

CREATE UNIQUE INDEX IF NOT EXISTS trip_destinations_company_supplier_key_idx
  ON trip_destinations (company_id, supplier_key)
  WHERE supplier_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS trip_destinations_company_idx ON trip_destinations (company_id, sort_order);

ALTER TABLE trip_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_destinations_select ON trip_destinations FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      company_id = public.current_company_id()
      OR public.can_read_module(company_id, 'work_reports')
    )
  );

CREATE POLICY trip_destinations_write ON trip_destinations FOR ALL
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'work_reports')
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'work_reports')
  );
