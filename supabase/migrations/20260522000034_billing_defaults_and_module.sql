-- Partner billing user flags default off (enable per user in Hallinta → Käyttäjät).

ALTER TABLE profiles
  ALTER COLUMN bill_hours_enabled SET DEFAULT false,
  ALTER COLUMN bill_expenses_enabled SET DEFAULT false;
