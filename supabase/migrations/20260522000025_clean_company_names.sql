-- Remove role suffixes from company display names.

UPDATE companies SET name = 'Yritys X' WHERE slug = 'yritys-x';
UPDATE companies SET name = 'Yritys Y' WHERE slug = 'yritys-y';
UPDATE companies SET name = 'Yritys Z' WHERE slug = 'yritys-z';

UPDATE companies
SET name = trim(regexp_replace(name, '\s*\((Alihankkija|Pääurakoitsija|Ei kumppani)\)\s*$', '', 'i'))
WHERE name ~* '\((Alihankkija|Pääurakoitsija|Ei kumppani)\)';
