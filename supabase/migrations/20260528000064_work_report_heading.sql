-- Työraportin erillinen otsikko tulosteeseen/PDF-nimeen.

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS heading TEXT;

COMMENT ON COLUMN work_reports.heading IS
  'Vapaa otsikko tulosteeseen ja PDF-tiedostonimeen (esim. ILK 22A korjaukset).';
