-- Default: no customers visible to partner unless explicitly shared or partner has created a report.
-- Migrate existing "open all" partnerships by copying current access into explicit rows.

ALTER TABLE company_partnerships
  ALTER COLUMN customer_access_restricted SET DEFAULT true;

INSERT INTO customer_partner_access (partnership_id, customer_id, can_view, can_create_reports)
SELECT cp.id, c.id, true, true
FROM company_partnerships cp
JOIN customers c ON c.owner_company_id IN (cp.company_a_id, cp.company_b_id)
WHERE cp.customer_access_restricted = false
  AND cp.status = 'active'
ON CONFLICT (partnership_id, customer_id) DO NOTHING;

ALTER TABLE company_partnerships DISABLE TRIGGER partnerships_permission_ownership;

UPDATE company_partnerships
SET customer_access_restricted = true
WHERE customer_access_restricted = false;

ALTER TABLE company_partnerships ENABLE TRIGGER partnerships_permission_ownership;

CREATE OR REPLACE FUNCTION public.can_read_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  cust RECORD;
  pid UUID;
  restricted BOOLEAN;
BEGIN
  IF cid IS NULL OR p_customer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.id, c.owner_company_id
  INTO cust
  FROM customers c
  WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF cust.owner_company_id = cid THEN
    RETURN true;
  END IF;

  IF NOT public.can_read_module(cust.owner_company_id, 'customers') THEN
    RETURN false;
  END IF;

  pid := public.partnership_id_between(cid, cust.owner_company_id);
  IF pid IS NULL THEN
    RETURN false;
  END IF;

  SELECT cp.customer_access_restricted
  INTO restricted
  FROM company_partnerships cp
  WHERE cp.id = pid;

  IF NOT COALESCE(restricted, true) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM customer_partner_access cpa
    WHERE cpa.partnership_id = pid
      AND cpa.customer_id = p_customer_id
      AND cpa.can_view = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM work_reports wr
    WHERE wr.customer_id = p_customer_id
      AND wr.owner_company_id = cust.owner_company_id
      AND wr.created_by_company_id = cid
  )
  OR EXISTS (
    SELECT 1
    FROM maintenance_reports mr
    WHERE mr.customer_id = p_customer_id
      AND mr.owner_company_id = cust.owner_company_id
      AND mr.created_by_company_id = cid
  );
END;
$$;
