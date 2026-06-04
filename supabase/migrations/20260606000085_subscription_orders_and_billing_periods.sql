-- Subscription orders, billing intervals, and payment tracking for company licenses.

CREATE OR REPLACE FUNCTION public.license_billing_interval_months(p_interval TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_interval, 'monthly')
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'semi_annual' THEN 6
    WHEN 'annual' THEN 12
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.license_billing_interval_label_fi(p_interval TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_interval, 'monthly')
    WHEN 'monthly' THEN 'Kuukausittain'
    WHEN 'quarterly' THEN '3 kk välein'
    WHEN 'semi_annual' THEN '6 kk välein'
    WHEN 'annual' THEN 'Kerran vuodessa'
    ELSE p_interval
  END;
$$;

CREATE OR REPLACE FUNCTION public.default_company_license_settings()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'enrollment', 'subscription',
    'status', 'pending_trial',
    'trial_started_at', NULL,
    'trial_ends_at', NULL,
    'billing_interval', 'monthly',
    'payment_status', 'none',
    'paid_through', NULL,
    'next_billing_at', NULL,
    'base_active', false,
    'modules', jsonb_build_object(
      'quotes', false,
      'billing', false,
      'remote_monitoring', false,
      'tools', false
    ),
    'order', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.license_monthly_total(
  p_license JSONB,
  p_catalog public.license_catalog
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
  END IF;
  IF COALESCE((p_license -> 'modules' ->> 'tools')::boolean, false) THEN
    monthly_total := monthly_total + COALESCE((module_prices ->> 'tools')::numeric, 0);
  END IF;

  RETURN monthly_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.license_period_total(
  p_monthly_total NUMERIC,
  p_interval TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    COALESCE(p_monthly_total, 0) * public.license_billing_interval_months(p_interval),
    2
  );
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

  IF effective_status = 'active' THEN
    IF public.company_module_allowed(license, effective_status, 'base') THEN
      monthly_total := monthly_total + catalog.base_monthly_eur;
    END IF;
    IF public.company_module_allowed(license, effective_status, 'quotes') THEN
      monthly_total := monthly_total + COALESCE((module_prices ->> 'quotes')::numeric, 0);
    END IF;
    IF public.company_module_allowed(license, effective_status, 'billing') THEN
      monthly_total := monthly_total + COALESCE((module_prices ->> 'billing')::numeric, 0);
    END IF;
    IF public.company_module_allowed(license, effective_status, 'remote_monitoring') THEN
      monthly_total := monthly_total + COALESCE((module_prices ->> 'remote_monitoring')::numeric, 0);
    END IF;
    IF public.company_module_allowed(license, effective_status, 'tools') THEN
      monthly_total := monthly_total + COALESCE((module_prices ->> 'tools')::numeric, 0);
    END IF;
    period_total := public.license_period_total(monthly_total, billing_interval);
  ELSIF license -> 'order' IS NOT NULL AND jsonb_typeof(license -> 'order') = 'object' THEN
    order_monthly := public.license_monthly_total(
      jsonb_build_object(
        'base_active', COALESCE((license -> 'order' ->> 'base_active')::boolean, false),
        'modules', COALESCE(license -> 'order' -> 'modules', '{}'::jsonb)
      ),
      catalog
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
    v_catalog
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

CREATE OR REPLACE FUNCTION public.global_admin_set_company_license(
  p_company_id UUID,
  p_status TEXT,
  p_base_active BOOLEAN,
  p_modules JSONB DEFAULT '{}'::jsonb,
  p_billing_interval TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_activate_pending_order BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_license JSONB;
  v_modules JSONB;
  v_billing JSONB;
  v_order JSONB;
  v_interval TEXT;
  v_months INT;
  v_paid_through TIMESTAMPTZ;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  IF p_status NOT IN ('pending_trial', 'trial', 'active', 'expired') THEN
    RAISE EXCEPTION 'Virheellinen lisenssitila';
  END IF;

  IF p_payment_status IS NOT NULL
     AND p_payment_status NOT IN ('none', 'awaiting_payment', 'paid', 'overdue') THEN
    RAISE EXCEPTION 'Virheellinen maksutila';
  END IF;

  IF p_billing_interval IS NOT NULL
     AND public.license_billing_interval_months(p_billing_interval) IS NULL THEN
    RAISE EXCEPTION 'Virheellinen laskutusjakso';
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb)
  INTO v_settings
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings());
  v_order := v_license -> 'order';

  IF p_activate_pending_order AND v_order IS NOT NULL AND jsonb_typeof(v_order) = 'object' THEN
    v_modules := COALESCE(v_order -> 'modules', '{}'::jsonb);
    v_license := v_license || jsonb_build_object(
      'status', 'active',
      'base_active', COALESCE((v_order ->> 'base_active')::boolean, false),
      'modules', v_modules,
      'billing_interval', COALESCE(v_order ->> 'billing_interval', v_license ->> 'billing_interval', 'monthly'),
      'payment_status', 'paid',
      'order', NULL
    );
  ELSE
    v_modules := COALESCE(v_license -> 'modules', '{}'::jsonb) || COALESCE(p_modules, '{}'::jsonb);
    v_license := v_license || jsonb_build_object(
      'enrollment', 'subscription',
      'status', p_status,
      'base_active', COALESCE(p_base_active, false),
      'modules', v_modules
    );
    IF p_billing_interval IS NOT NULL THEN
      v_license := v_license || jsonb_build_object('billing_interval', p_billing_interval);
    END IF;
    IF p_payment_status IS NOT NULL THEN
      v_license := v_license || jsonb_build_object('payment_status', p_payment_status);
    END IF;
  END IF;

  v_interval := COALESCE(NULLIF(v_license ->> 'billing_interval', ''), 'monthly');
  v_months := public.license_billing_interval_months(v_interval);

  IF COALESCE(v_license ->> 'payment_status', 'none') = 'paid'
     AND COALESCE(v_license ->> 'status', '') = 'active' THEN
    v_paid_through := now() + make_interval(months => v_months);
    v_license := v_license || jsonb_build_object(
      'paid_through', to_jsonb(v_paid_through),
      'next_billing_at', to_jsonb(v_paid_through)
    );
  END IF;

  v_billing := COALESCE(v_settings -> 'billing', '{}'::jsonb);
  v_billing := v_billing || jsonb_build_object(
    'module_enabled', COALESCE((v_license -> 'modules' ->> 'billing')::boolean, false)
  );

  UPDATE public.companies
  SET
    settings = jsonb_set(
      jsonb_set(v_settings, '{license}', v_license, true),
      '{billing}',
      v_billing,
      true
    ),
    updated_at = now()
  WHERE id = p_company_id;

  RETURN public.company_license_snapshot(p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_license_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY company_name),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'company_slug', c.slug,
      'snapshot', public.company_license_snapshot(c.id)
    ) AS row_data,
    c.name AS company_name
    FROM public.companies c
  ) sub;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.license_billing_interval_months(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_billing_interval_months(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.license_billing_interval_label_fi(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_billing_interval_label_fi(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.license_monthly_total(JSONB, public.license_catalog) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_monthly_total(JSONB, public.license_catalog) TO authenticated;
REVOKE ALL ON FUNCTION public.license_period_total(NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_period_total(NUMERIC, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_company_subscription_order(BOOLEAN, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_company_subscription_order(BOOLEAN, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.global_admin_license_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_license_overview() TO authenticated;
