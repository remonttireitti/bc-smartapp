-- Etäseuranta: moduulihinta + laitekohtainen €/kk (tyypistä riippuen).

ALTER TABLE public.license_catalog
  ADD COLUMN IF NOT EXISTS temp_device_monthly_prices JSONB NOT NULL DEFAULT '{
    "jc3248": 5.00,
    "esp32_ds18b20": 5.00,
    "default": 5.00
  }'::jsonb;

UPDATE public.license_catalog
SET temp_device_monthly_prices = COALESCE(temp_device_monthly_prices, '{
  "jc3248": 5.00,
  "esp32_ds18b20": 5.00,
  "default": 5.00
}'::jsonb)
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.temp_device_unit_monthly_eur(
  p_device_type TEXT,
  p_prices JSONB
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF((COALESCE(p_prices, '{}'::jsonb) ->> COALESCE(NULLIF(trim(p_device_type), ''), 'default'))::numeric, 0),
    (COALESCE(p_prices, '{}'::jsonb) ->> 'default')::numeric,
    5::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public.company_remote_monitoring_devices_pricing(
  p_company_id UUID,
  p_catalog public.license_catalog
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prices JSONB;
  by_type JSONB := '[]'::jsonb;
  billable_count INT := 0;
  monthly_eur NUMERIC(10, 2) := 0;
  unit_eur NUMERIC(10, 2);
  subtotal NUMERIC(10, 2);
  r RECORD;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'billable_count', 0,
      'monthly_eur', 0,
      'by_type', '[]'::jsonb,
      'unit_prices', COALESCE(p_catalog.temp_device_monthly_prices, '{}'::jsonb)
    );
  END IF;

  prices := COALESCE(p_catalog.temp_device_monthly_prices, '{"default": 5}'::jsonb);

  FOR r IN
    SELECT
      COALESCE(NULLIF(trim(d.device_type), ''), 'jc3248') AS device_type,
      COUNT(*)::int AS device_count
    FROM public.temp_devices d
    WHERE d.company_id = p_company_id
      AND COALESCE(d.is_shared_demo, false) = false
    GROUP BY 1
    ORDER BY 1
  LOOP
    unit_eur := public.temp_device_unit_monthly_eur(r.device_type, prices);
    subtotal := ROUND(unit_eur * r.device_count, 2);
    billable_count := billable_count + r.device_count;
    monthly_eur := monthly_eur + subtotal;
    by_type := by_type || jsonb_build_array(
      jsonb_build_object(
        'device_type', r.device_type,
        'count', r.device_count,
        'unit_eur', unit_eur,
        'subtotal_eur', subtotal
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'billable_count', billable_count,
    'monthly_eur', ROUND(monthly_eur, 2),
    'by_type', by_type,
    'unit_prices', prices
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.company_remote_monitoring_devices_monthly_eur(
  p_company_id UUID,
  p_catalog public.license_catalog
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.company_remote_monitoring_devices_pricing(p_company_id, p_catalog) ->> 'monthly_eur')::numeric, 0);
$$;

CREATE OR REPLACE FUNCTION public.license_monthly_total(
  p_license JSONB,
  p_catalog public.license_catalog,
  p_company_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  module_prices JSONB;
  monthly_total NUMERIC(10, 2) := 0;
BEGIN
  module_prices := COALESCE(p_catalog.module_prices, '{}'::jsonb);

  IF COALESCE((p_license ->> 'base_active')::boolean, false) THEN
    monthly_total := monthly_total + p_catalog.base_monthly_eur;
  END IF;
  IF COALESCE((p_license -> 'modules' ->> 'quotes')::boolean, false) THEN
    monthly_total := monthly_total + COALESCE((module_prices ->> 'quotes')::numeric, 0);
  END IF;
  IF COALESCE((p_license -> 'modules' ->> 'billing')::boolean, false) THEN
    monthly_total := monthly_total + COALESCE((module_prices ->> 'billing')::numeric, 0);
  END IF;
  IF COALESCE((p_license -> 'modules' ->> 'remote_monitoring')::boolean, false) THEN
    monthly_total := monthly_total + COALESCE((module_prices ->> 'remote_monitoring')::numeric, 0);
    IF p_company_id IS NOT NULL THEN
      monthly_total := monthly_total
        + public.company_remote_monitoring_devices_monthly_eur(p_company_id, p_catalog);
    END IF;
  END IF;
  IF COALESCE((p_license -> 'modules' ->> 'tools')::boolean, false) THEN
    monthly_total := monthly_total + COALESCE((module_prices ->> 'tools')::numeric, 0);
  END IF;

  RETURN monthly_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_license_snapshot(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  license JSONB;
  catalog public.license_catalog;
  effective_status TEXT;
  module_prices JSONB;
  monthly_total NUMERIC(10, 2) := 0;
  billing_interval TEXT;
  period_months INT;
  period_total NUMERIC(10, 2) := 0;
  usage_rows JSONB := '[]'::jsonb;
  order_monthly NUMERIC(10, 2);
  device_pricing JSONB;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_company');
  END IF;

  license := public.company_license_settings(p_company_id);
  catalog := public.license_catalog_row();
  effective_status := public.effective_company_license_status(license);
  module_prices := COALESCE(catalog.module_prices, '{}'::jsonb);
  billing_interval := COALESCE(NULLIF(license ->> 'billing_interval', ''), 'monthly');
  period_months := public.license_billing_interval_months(billing_interval);
  device_pricing := public.company_remote_monitoring_devices_pricing(p_company_id, catalog);

  IF effective_status = 'active' THEN
    monthly_total := public.license_monthly_total(
      jsonb_build_object(
        'base_active', public.company_module_allowed(license, effective_status, 'base'),
        'modules', jsonb_build_object(
          'quotes', public.company_module_allowed(license, effective_status, 'quotes'),
          'billing', public.company_module_allowed(license, effective_status, 'billing'),
          'remote_monitoring', public.company_module_allowed(license, effective_status, 'remote_monitoring'),
          'tools', public.company_module_allowed(license, effective_status, 'tools')
        )
      ),
      catalog,
      p_company_id
    );
    period_total := public.license_period_total(monthly_total, billing_interval);
  ELSIF license -> 'order' IS NOT NULL AND jsonb_typeof(license -> 'order') = 'object' THEN
    order_monthly := public.license_monthly_total(
      jsonb_build_object(
        'base_active', COALESCE((license -> 'order' ->> 'base_active')::boolean, false),
        'modules', COALESCE(license -> 'order' -> 'modules', '{}'::jsonb)
      ),
      catalog,
      p_company_id
    );
    period_total := COALESCE((license -> 'order' ->> 'estimated_period_eur')::numeric, public.license_period_total(order_monthly, billing_interval));
    monthly_total := order_monthly;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'module_key', u.module_key,
        'access_count', u.access_count,
        'last_accessed_at', u.last_accessed_at
      )
      ORDER BY u.module_key
    ),
    '[]'::jsonb
  )
  INTO usage_rows
  FROM public.company_module_usage u
  WHERE u.company_id = p_company_id
    AND u.period_month = date_trunc('month', now())::date;

  RETURN jsonb_build_object(
    'enrollment', COALESCE(license ->> 'enrollment', 'subscription'),
    'status', COALESCE(license ->> 'status', 'pending_trial'),
    'effective_status', effective_status,
    'trial_started_at', license -> 'trial_started_at',
    'trial_ends_at', license -> 'trial_ends_at',
    'trial_days', catalog.trial_days,
    'billing_interval', billing_interval,
    'billing_interval_label', public.license_billing_interval_label_fi(billing_interval),
    'billing_interval_months', period_months,
    'payment_status', COALESCE(NULLIF(license ->> 'payment_status', ''), 'none'),
    'paid_through', license -> 'paid_through',
    'next_billing_at', license -> 'next_billing_at',
    'order', license -> 'order',
    'base_active', public.company_module_allowed(license, effective_status, 'base'),
    'modules', jsonb_build_object(
      'quotes', public.company_module_allowed(license, effective_status, 'quotes'),
      'billing', public.company_module_allowed(license, effective_status, 'billing'),
      'remote_monitoring', public.company_module_allowed(license, effective_status, 'remote_monitoring'),
      'tools', public.company_module_allowed(license, effective_status, 'tools')
    ),
    'pricing', jsonb_build_object(
      'base_monthly_eur', catalog.base_monthly_eur,
      'module_prices', module_prices,
      'temp_device_unit_prices', COALESCE(catalog.temp_device_monthly_prices, '{}'::jsonb),
      'remote_monitoring_devices', device_pricing,
      'estimated_monthly_total_eur', monthly_total,
      'estimated_period_total_eur', period_total
    ),
    'usage_this_month', usage_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_company_subscription_order(
  p_base_active BOOLEAN,
  p_modules JSONB DEFAULT '{}'::jsonb,
  p_billing_interval TEXT DEFAULT 'monthly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_settings JSONB;
  v_license JSONB;
  v_catalog public.license_catalog;
  v_effective TEXT;
  v_monthly NUMERIC(10, 2);
  v_period_total NUMERIC(10, 2);
  v_modules JSONB;
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'Vain yrityksen ylläpitäjä voi tehdä tilauksen';
  END IF;

  IF public.license_billing_interval_months(p_billing_interval) IS NULL THEN
    RAISE EXCEPTION 'Virheellinen laskutusjakso';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Yritys puuttuu';
  END IF;

  SELECT COALESCE(c.settings, '{}'::jsonb)
  INTO v_settings
  FROM public.companies c
  WHERE c.id = v_company_id
  FOR UPDATE;

  v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings());
  v_effective := public.effective_company_license_status(v_license);

  IF COALESCE(v_license ->> 'enrollment', 'subscription') = 'legacy' THEN
    RAISE EXCEPTION 'Legacy-yrityksellä ei ole tilausmallia';
  END IF;

  IF v_effective <> 'expired' THEN
    RAISE EXCEPTION 'Tilaus voidaan tehdä vasta kokeilujakson päättymisen jälkeen';
  END IF;

  IF NOT COALESCE(p_base_active, false)
     AND NOT COALESCE((p_modules ->> 'quotes')::boolean, false)
     AND NOT COALESCE((p_modules ->> 'billing')::boolean, false)
     AND NOT COALESCE((p_modules ->> 'remote_monitoring')::boolean, false)
     AND NOT COALESCE((p_modules ->> 'tools')::boolean, false) THEN
    RAISE EXCEPTION 'Valitse vähintään yksi moduuli tai peruspaketti';
  END IF;

  v_catalog := public.license_catalog_row();
  v_modules := COALESCE(p_modules, '{}'::jsonb);
  v_monthly := public.license_monthly_total(
    jsonb_build_object('base_active', p_base_active, 'modules', v_modules),
    v_catalog,
    v_company_id
  );
  v_period_total := public.license_period_total(v_monthly, p_billing_interval);

  v_license := v_license || jsonb_build_object(
    'billing_interval', p_billing_interval,
    'payment_status', 'awaiting_payment',
    'order', jsonb_build_object(
      'submitted_at', to_jsonb(now()),
      'submitted_by', to_jsonb(auth.uid()),
      'base_active', COALESCE(p_base_active, false),
      'modules', v_modules,
      'billing_interval', p_billing_interval,
      'estimated_monthly_eur', v_monthly,
      'estimated_period_eur', v_period_total
    )
  );

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = v_company_id;

  RETURN public.company_license_snapshot(v_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_update_license_catalog(
  p_trial_days INT,
  p_base_monthly_eur NUMERIC,
  p_module_prices JSONB,
  p_temp_device_monthly_prices JSONB DEFAULT NULL
)
RETURNS public.license_catalog
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  UPDATE public.license_catalog
  SET
    trial_days = GREATEST(COALESCE(p_trial_days, trial_days), 1),
    base_monthly_eur = GREATEST(COALESCE(p_base_monthly_eur, base_monthly_eur), 0),
    module_prices = COALESCE(module_prices, '{}'::jsonb) || COALESCE(p_module_prices, '{}'::jsonb),
    temp_device_monthly_prices = COALESCE(
      temp_device_monthly_prices,
      '{"jc3248": 5, "esp32_ds18b20": 5, "default": 5}'::jsonb
    ) || COALESCE(p_temp_device_monthly_prices, '{}'::jsonb),
    updated_at = now()
  WHERE id = 1;

  RETURN (SELECT c FROM public.license_catalog c WHERE c.id = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.temp_device_unit_monthly_eur(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.temp_device_unit_monthly_eur(TEXT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.company_remote_monitoring_devices_pricing(UUID, public.license_catalog) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_remote_monitoring_devices_pricing(UUID, public.license_catalog) TO authenticated;
REVOKE ALL ON FUNCTION public.company_remote_monitoring_devices_monthly_eur(UUID, public.license_catalog) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_remote_monitoring_devices_monthly_eur(UUID, public.license_catalog) TO authenticated;

REVOKE ALL ON FUNCTION public.license_monthly_total(JSONB, public.license_catalog, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_monthly_total(JSONB, public.license_catalog, UUID) TO authenticated;
