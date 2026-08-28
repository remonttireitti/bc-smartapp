-- Vuokrapullon vuokraaja (tukkuri).

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS rental_supplier TEXT;

ALTER TABLE refrigerant_cylinders
  DROP CONSTRAINT IF EXISTS refrigerant_cylinders_rental_supplier_check;

ALTER TABLE refrigerant_cylinders
  ADD CONSTRAINT refrigerant_cylinders_rental_supplier_check
  CHECK (
    rental_supplier IS NULL
    OR rental_supplier IN ('darment', 'combi_cool', 'ecoscandic', 'onninen', 'refair')
  );

COMMENT ON COLUMN refrigerant_cylinders.rental_supplier IS
  'Vuokrapullon vuokraaja: darment, combi_cool, ecoscandic, onninen, refair';
