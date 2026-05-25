-- TUKES-numero käyttäjän omissa tiedoissa (huoltopöytäkirjan suorittaja)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tukes_number TEXT;

COMMENT ON COLUMN profiles.tukes_number IS 'Kylmäalan TUKES-tunnus; näkyy huoltopöytäkirjassa raportin laatijana.';
