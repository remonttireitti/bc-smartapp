-- Esimerkkidata ensikäyttäjille: merkitty poistettavaksi yhdellä komennolla.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_onboarding_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS is_onboarding_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS is_onboarding_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_onboarding_demo
  ON customers (owner_company_id)
  WHERE is_onboarding_demo = true;

CREATE INDEX IF NOT EXISTS idx_work_reports_onboarding_demo
  ON work_reports (owner_company_id)
  WHERE is_onboarding_demo = true;

CREATE OR REPLACE FUNCTION public.onboarding_demo_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT p.company_id
  INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL OR public.is_customer_user() THEN
    RETURN jsonb_build_object(
      'has_demo', false,
      'customers', 0,
      'reports', 0,
      'equipment', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'has_demo', EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.owner_company_id = v_company_id
        AND c.is_onboarding_demo = true
    ),
    'customers', (
      SELECT COUNT(*)::int
      FROM public.customers c
      WHERE c.owner_company_id = v_company_id
        AND c.is_onboarding_demo = true
    ),
    'reports', (
      SELECT COUNT(*)::int
      FROM public.work_reports w
      WHERE w.owner_company_id = v_company_id
        AND w.is_onboarding_demo = true
    ),
    'equipment', (
      SELECT COUNT(*)::int
      FROM public.equipment e
      WHERE e.owner_company_id = v_company_id
        AND e.is_onboarding_demo = true
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_onboarding_demo_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_customer_1 UUID;
  v_customer_2 UUID;
  v_equipment_1 UUID;
  v_equipment_2 UUID;
  v_report_draft UUID;
  v_report_active UUID;
  v_today DATE := CURRENT_DATE;
  v_scheduled TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR public.is_customer_user() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_allowed');
  END IF;

  SELECT p.company_id
  INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_company');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.owner_company_id = v_company_id
      AND c.is_onboarding_demo = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_exists');
  END IF;

  v_scheduled := ((CURRENT_DATE + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Europe/Helsinki';

  INSERT INTO public.customers (
    owner_company_id,
    name,
    address,
    city,
    phone,
    notes,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    'Esimerkki: Ravintola Kallio',
    'Hämeentie 45',
    'Helsinki',
    '040 123 4567',
    'BC Smartapp esimerkkiasiakas — voit poistaa kaikki esimerkit etusivulta yhdellä napilla.',
    true
  )
  RETURNING id INTO v_customer_1;

  INSERT INTO public.customers (
    owner_company_id,
    name,
    address,
    city,
    phone,
    notes,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    'Esimerkki: Toimisto Kamppi',
    'Urho Kekkosen katu 1',
    'Helsinki',
    '040 765 4321',
    'BC Smartapp esimerkkiasiakas — voit poistaa kaikki esimerkit etusivulta yhdellä napilla.',
    true
  )
  RETURNING id INTO v_customer_2;

  INSERT INTO public.equipment (
    owner_company_id,
    customer_id,
    name,
    tag,
    model,
    location,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    v_customer_1,
    'Kylmähuone 1',
    'KYL-01',
    'Bitzer condensing unit',
    'Keittiön takana',
    true
  )
  RETURNING id INTO v_equipment_1;

  INSERT INTO public.equipment (
    owner_company_id,
    customer_id,
    name,
    tag,
    model,
    location,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    v_customer_2,
    'Ilmalämpöpumppu',
    'ILP-01',
    'Daikin Sensira',
    'Katto',
    true
  )
  RETURNING id INTO v_equipment_2;

  INSERT INTO public.work_reports (
    owner_company_id,
    created_by_company_id,
    branding_company_id,
    created_by_user_id,
    assigned_user_id,
    customer_id,
    equipment_id,
    title,
    heading,
    description,
    location_text,
    status,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    v_company_id,
    v_company_id,
    v_user_id,
    v_user_id,
    v_customer_1,
    v_equipment_1,
    'Esimerkki: Ravintola Kallio — huoltokäynti',
    'Huoltokäynti (esimerkkiluonnos)',
    'Esimerkkityöraportti luonnoksena. Muokkaa vapaasti tai poista esimerkkidata etusivulta.',
    'Hämeentie 45, Helsinki',
    'draft',
    true
  )
  RETURNING id INTO v_report_draft;

  INSERT INTO public.work_report_billing (work_report_id)
  VALUES (v_report_draft);

  INSERT INTO public.work_reports (
    owner_company_id,
    created_by_company_id,
    branding_company_id,
    created_by_user_id,
    assigned_user_id,
    customer_id,
    equipment_id,
    title,
    heading,
    description,
    location_text,
    status,
    scheduled_start,
    is_onboarding_demo
  )
  VALUES (
    v_company_id,
    v_company_id,
    v_company_id,
    v_user_id,
    v_user_id,
    v_customer_2,
    v_equipment_2,
    'Esimerkki: Toimisto Kamppi — asennus',
    'Asennus (esimerkki kalenterissa)',
    'Esimerkkityö käynnissä — kalenterissa näkyy päiväkirjaus ja huomenna ajoitettu aloitus.',
    'Urho Kekkosen katu 1, Helsinki',
    'in_progress',
    v_scheduled,
    true
  )
  RETURNING id INTO v_report_active;

  INSERT INTO public.work_report_billing (work_report_id)
  VALUES (v_report_active);

  INSERT INTO public.work_report_daily_logs (
    work_report_id,
    log_date,
    log_start_time,
    entry_type,
    hours_regular,
    work_done,
    created_by
  )
  VALUES (
    v_report_active,
    v_today,
    TIME '09:00',
    'regular',
    2,
    'Esimerkkipäiväkirja: laitteen tarkistus ja mittaukset. Voit muokata tai poistaa esimerkkidatan etusivulta.',
    v_user_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'customers', 2,
    'reports', 2,
    'equipment', 2
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_onboarding_demo_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_reports INT;
  v_equipment INT;
  v_customers INT;
BEGIN
  IF auth.uid() IS NULL OR public.is_customer_user() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_allowed');
  END IF;

  SELECT p.company_id
  INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_company');
  END IF;

  DELETE FROM public.work_reports w
  WHERE w.owner_company_id = v_company_id
    AND w.is_onboarding_demo = true;
  GET DIAGNOSTICS v_reports = ROW_COUNT;

  DELETE FROM public.equipment e
  WHERE e.owner_company_id = v_company_id
    AND e.is_onboarding_demo = true;
  GET DIAGNOSTICS v_equipment = ROW_COUNT;

  DELETE FROM public.customers c
  WHERE c.owner_company_id = v_company_id
    AND c.is_onboarding_demo = true;
  GET DIAGNOSTICS v_customers = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'customers', v_customers,
    'reports', v_reports,
    'equipment', v_equipment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_demo_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_onboarding_demo_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_onboarding_demo_data() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.onboarding_demo_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_demo_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_onboarding_demo_data() TO authenticated;
