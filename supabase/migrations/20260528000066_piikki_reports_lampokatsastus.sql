-- Piikki (Asemamiehenkatu 2, Ratamestarinkatu 11): huoltoraportit ja asiakkaat Lämpökatsastus Oy:lle,
-- jotta Uudenmaan Kylmähuolto Oy ei näe niitä created_by / owner -kentän kautta.

DO $$
DECLARE
  uudenmaan_id UUID;
  lampokatsastus_id UUID;
  n_customers INT := 0;
  n_equipment INT := 0;
  n_reports INT := 0;
BEGIN
  SELECT id INTO uudenmaan_id
  FROM companies
  WHERE name ILIKE '%uudenmaan%kylm%'
  LIMIT 1;

  SELECT id INTO lampokatsastus_id
  FROM companies
  WHERE name ILIKE '%lämpökatsastus%' OR name ILIKE '%lampokatsastus%'
  LIMIT 1;

  IF lampokatsastus_id IS NULL THEN
    RAISE NOTICE 'Lämpökatsastus Oy not found — skip piikki ownership fix';
    RETURN;
  END IF;

  WITH piikki_customers AS (
    SELECT c.id
    FROM customers c
    WHERE (
      (
        c.address ILIKE '%asemamiehenkatu%'
        AND (c.address ~* '(^|[^0-9])2([^0-9]|$)' OR c.address ILIKE '% 2%')
      )
      OR (
        c.address ILIKE '%ratamestarinkatu%'
        AND (c.address ~* '(^|[^0-9])11([^0-9]|$)' OR c.address ILIKE '% 11%')
      )
      OR c.address ILIKE '%asemamiehenkatu 2%'
      OR c.address ILIKE '%ratamestarinkatu 11%'
    )
    AND (
      c.city ILIKE '%piikki%'
      OR c.address ILIKE '%piikki%'
      OR c.name ILIKE '%piikki%'
      OR c.address ILIKE '%asemamiehenkatu%'
      OR c.address ILIKE '%ratamestarinkatu%'
    )
  )
  UPDATE customers c
  SET owner_company_id = lampokatsastus_id, updated_at = now()
  FROM piikki_customers p
  WHERE c.id = p.id
    AND c.owner_company_id IS DISTINCT FROM lampokatsastus_id;
  GET DIAGNOSTICS n_customers = ROW_COUNT;

  UPDATE equipment e
  SET owner_company_id = lampokatsastus_id, updated_at = now()
  FROM customers c
  WHERE e.customer_id = c.id
    AND (
      (
        c.address ILIKE '%asemamiehenkatu%'
        AND (c.address ~* '(^|[^0-9])2([^0-9]|$)' OR c.address ILIKE '% 2%')
      )
      OR (
        c.address ILIKE '%ratamestarinkatu%'
        AND (c.address ~* '(^|[^0-9])11([^0-9]|$)' OR c.address ILIKE '% 11%')
      )
      OR c.address ILIKE '%asemamiehenkatu 2%'
      OR c.address ILIKE '%ratamestarinkatu 11%'
    )
    AND e.owner_company_id IS DISTINCT FROM lampokatsastus_id;
  GET DIAGNOSTICS n_equipment = ROW_COUNT;

  UPDATE maintenance_reports mr
  SET
    owner_company_id = lampokatsastus_id,
    created_by_company_id = lampokatsastus_id,
    branding_company_id = lampokatsastus_id,
    updated_at = now()
  WHERE (
    mr.customer_id IN (
      SELECT c.id FROM customers c
      WHERE (
        (
          c.address ILIKE '%asemamiehenkatu%'
          AND (c.address ~* '(^|[^0-9])2([^0-9]|$)' OR c.address ILIKE '% 2%')
        )
        OR (
          c.address ILIKE '%ratamestarinkatu%'
          AND (c.address ~* '(^|[^0-9])11([^0-9]|$)' OR c.address ILIKE '% 11%')
        )
        OR c.address ILIKE '%asemamiehenkatu 2%'
        OR c.address ILIKE '%ratamestarinkatu 11%'
      )
    )
    OR COALESCE(mr.data->>'osoite', '') ILIKE '%asemamiehenkatu%2%'
    OR COALESCE(mr.data->>'osoite', '') ILIKE '%ratamestarinkatu%11%'
  )
  AND (
    mr.owner_company_id IS DISTINCT FROM lampokatsastus_id
    OR mr.created_by_company_id IS DISTINCT FROM lampokatsastus_id
    OR mr.branding_company_id IS DISTINCT FROM lampokatsastus_id
    OR (uudenmaan_id IS NOT NULL AND (
      mr.owner_company_id = uudenmaan_id
      OR mr.created_by_company_id = uudenmaan_id
      OR mr.branding_company_id = uudenmaan_id
    ))
  );
  GET DIAGNOSTICS n_reports = ROW_COUNT;

  RAISE NOTICE 'Piikki ownership: customers=%, equipment=%, maintenance_reports=%',
    n_customers, n_equipment, n_reports;
END $$;
