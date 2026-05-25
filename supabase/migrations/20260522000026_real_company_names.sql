-- Realistic dev company names + Termatek Oy as fourth test company.

UPDATE companies SET name = 'BC Smartapp' WHERE slug = 'yritys-x';
UPDATE companies SET name = 'Uudenmaan Kylmähuolto Oy' WHERE slug = 'yritys-y';
UPDATE companies SET name = 'Lämpökatsastus Oy' WHERE slug = 'yritys-z';

INSERT INTO companies (id, name, slug) VALUES
  ('44444444-4444-4444-8444-444444444444', 'Termatek Oy', 'termatek-oy')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

UPDATE work_reports
SET title = 'Huolto BC Smartapp → Uudenmaan Kylmähuolto'
WHERE title = 'Huolto X:n toimesta Y:n logoilla';
