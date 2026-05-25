-- Globaali admin: näe kaikki asiakkaat, yhdistä duplikaatit, poista turhat.

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
  IF public.is_global_admin() THEN
    RETURN true;
  END IF;

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

DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
  USING (
    public.is_global_admin()
    OR CASE
      WHEN public.is_customer_user() THEN id = public.current_customer_id()
      ELSE public.can_read_customer(id)
    END
  );

CREATE OR REPLACE FUNCTION public.global_admin_merge_customers(
  p_target_customer_id UUID,
  p_source_customer_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_id UUID;
  target_owner UUID;
  moved_equipment INTEGER := 0;
  moved_work INTEGER := 0;
  moved_maint INTEGER := 0;
  moved_quotes INTEGER := 0;
  moved_docs INTEGER := 0;
  deleted_sources INTEGER := 0;
  batch_count INTEGER;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  IF p_target_customer_id IS NULL OR p_source_customer_ids IS NULL OR array_length(p_source_customer_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Kohdeasiakas ja yhdistettävät asiakkaat vaaditaan';
  END IF;

  IF p_target_customer_id = ANY(p_source_customer_ids) THEN
    RAISE EXCEPTION 'Kohdeasiakas ei voi olla yhdistettävien joukossa';
  END IF;

  SELECT owner_company_id
  INTO target_owner
  FROM customers
  WHERE id = p_target_customer_id;

  IF target_owner IS NULL THEN
    RAISE EXCEPTION 'Kohdeasiakasta ei löydy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = ANY(p_source_customer_ids)
      AND c.owner_company_id <> target_owner
  ) THEN
    RAISE EXCEPTION 'Kaikkien asiakkaiden täytyy kuulua samalle omistavalle yritykselle';
  END IF;

  FOREACH source_id IN ARRAY p_source_customer_ids LOOP
    IF source_id = p_target_customer_id THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = source_id) THEN
      RAISE EXCEPTION 'Asiakasta % ei löydy', source_id;
    END IF;

    UPDATE equipment
    SET customer_id = p_target_customer_id, updated_at = now()
    WHERE customer_id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    moved_equipment := moved_equipment + batch_count;

    UPDATE work_reports
    SET customer_id = p_target_customer_id, updated_at = now()
    WHERE customer_id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    moved_work := moved_work + batch_count;

    UPDATE maintenance_reports
    SET customer_id = p_target_customer_id, updated_at = now()
    WHERE customer_id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    moved_maint := moved_maint + batch_count;

    UPDATE quote_requests
    SET customer_id = p_target_customer_id, updated_at = now()
    WHERE customer_id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    moved_quotes := moved_quotes + batch_count;

    UPDATE documents
    SET customer_id = p_target_customer_id
    WHERE customer_id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    moved_docs := moved_docs + batch_count;

    INSERT INTO customer_partner_access (partnership_id, customer_id, can_view, can_create_reports)
    SELECT cpa.partnership_id, p_target_customer_id, cpa.can_view, cpa.can_create_reports
    FROM customer_partner_access cpa
    WHERE cpa.customer_id = source_id
    ON CONFLICT (partnership_id, customer_id) DO UPDATE SET
      can_view = customer_partner_access.can_view OR EXCLUDED.can_view,
      can_create_reports = customer_partner_access.can_create_reports OR EXCLUDED.can_create_reports;

    DELETE FROM customer_partner_access WHERE customer_id = source_id;

    UPDATE profiles
    SET customer_id = p_target_customer_id
    WHERE customer_id = source_id;

    UPDATE customers tgt
    SET
      business_id = COALESCE(tgt.business_id, src.business_id),
      email = COALESCE(tgt.email, src.email),
      phone = COALESCE(tgt.phone, src.phone),
      address = COALESCE(tgt.address, src.address),
      city = COALESCE(tgt.city, src.city),
      notes = CASE
        WHEN tgt.notes IS NULL OR btrim(tgt.notes) = '' THEN src.notes
        WHEN src.notes IS NULL OR btrim(src.notes) = '' THEN tgt.notes
        ELSE tgt.notes || E'\n---\n' || src.notes
      END,
      updated_at = now()
    FROM customers src
    WHERE tgt.id = p_target_customer_id
      AND src.id = source_id;

    DELETE FROM customers WHERE id = source_id;
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    deleted_sources := deleted_sources + batch_count;
  END LOOP;

  RETURN jsonb_build_object(
    'target_customer_id', p_target_customer_id,
    'merged_count', deleted_sources,
    'equipment_moved', moved_equipment,
    'work_reports_moved', moved_work,
    'maintenance_reports_moved', moved_maint,
    'quote_requests_moved', moved_quotes,
    'documents_moved', moved_docs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.global_admin_merge_customers(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_merge_customers(UUID, UUID[]) TO authenticated;
