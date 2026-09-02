-- Lisätyöt tarjouksen päälle: merkintä päiväkirjamerkinnälle.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS customer_extra_beyond_quote BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN work_report_daily_logs.customer_extra_beyond_quote IS
  'Kun työraportilla on tarjous + lisälaskutus, tämän merkinnän tunnit/urakat/provisio laskutetaan asiakkaalta tarjouksen päälle.';
