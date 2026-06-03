-- Company licensing: trial, subscriptions, module usage, forced password change.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.license_catalog (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trial_days INT NOT NULL DEFAULT 30,
  base_monthly_eur NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
  module_prices JSONB NOT NULL DEFAULT '{
    "quotes": 19.00,
    "billing": 19.00,
    "remote_monitoring": 29.00,
    "tools": 9.00
  }'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.license_catalog (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.company_module_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  period_month DATE NOT NULL,
  access_count INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  UNIQUE (company_id, module_key, period_month)
);

CREATE INDEX IF NOT EXISTS company_module_usage_company_idx
  ON public.company_module_usage (company_id, period_month DESC);

ALTER TABLE public.company_module_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_module_usage_select_staff ON public.company_module_usage
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR company_id = public.current_company_id()
  );

CREATE POLICY company_module_usage_insert_staff ON public.company_module_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    OR public.is_global_admin()
  );

CREATE POLICY company_module_usage_update_staff ON public.company_module_usage
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    OR public.is_global_admin()
  )
  WITH CHECK (
    company_id = public.current_company_id()
    OR public.is_global_admin()
  );

CREATE OR REPLACE FUNCTION public.license_catalog_row()
RETURNS public.license_catalog
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.license_catalog WHERE id = 1;
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
    'base_active', false,
    'modules', jsonb_build_object(
      'quotes', false,
      'billing', false,
      'remote_monitoring', false,
      'tools', false
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.legacy_company_license_settings()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'enrollment', 'legacy',
    'status', 'active',
    'trial_started_at', NULL,
    'trial_ends_at', NULL,
    'base_active', true,
    'modules', jsonb_build_object(
      'quotes', true,
      'billing', true,
      'remote_monitoring', true,
      'tools', true
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.company_license_settings(p_company_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.settings -> 'license' FROM public.companies c WHERE c.id = p_company_id),
    public.default_company_license_settings()
  );
$$;

CREATE OR REPLACE FUNCTION public.effective_company_license_status(p_license JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  enrollment TEXT;
  status TEXT;
  trial_ends TIMESTAMPTZ;
BEGIN
  enrollment := COALESCE(p_license ->> 'enrollment', 'subscription');
  IF enrollment = 'legacy' THEN
    RETURN 'active';
  END IF;

  status := COALESCE(p_license ->> 'status', 'pending_trial');
  IF status = 'trial' THEN
    trial_ends := NULLIF(p_license ->> 'trial_ends_at', '')::timestamptz;
    IF trial_ends IS NOT NULL AND trial_ends <= now() THEN
      RETURN 'expired';
    END IF;
    RETURN 'trial';
  END IF;

  RETURN status;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_module_allowed(
  p_license JSONB,
  p_effective_status TEXT,
  p_module_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  modules JSONB;
BEGIN
  IF COALESCE(p_license ->> 'enrollment', 'subscription') = 'legacy' THEN
    RETURN true;
  END IF;

  IF p_effective_status IN ('trial', 'active') THEN
    IF p_module_key = 'base' THEN
      IF p_effective_status = 'trial' THEN
        RETURN true;
      END IF;
      RETURN COALESCE((p_license ->> 'base_active')::boolean, false);
    END IF;

    IF p_effective_status = 'trial' THEN
      RETURN true;
    END IF;

    modules := COALESCE(p_license -> 'modules', '{}'::jsonb);
    RETURN COALESCE((modules ->> p_module_key)::boolean, false);
  END IF;

  RETURN false;
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
  usage_rows JSONB := '[]'::jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_company');
  END IF;

  license := public.company_license_settings(p_company_id);
  catalog := public.license_catalog_row();
  effective_status := public.effective_company_license_status(license);
  module_prices := COALESCE(catalog.module_prices, '{}'::jsonb);

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
      'estimated_monthly_total_eur', monthly_total
    ),
    'usage_this_month', usage_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_company_trial_on_login()
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
  v_trial_days INT;
BEGIN
  SELECT p.company_id
  INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'no_company');
  END IF;

  SELECT COALESCE(c.settings, '{}'::jsonb)
  INTO v_settings
  FROM public.companies c
  WHERE c.id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('started', false, 'reason', 'company_not_found');
  END IF;

  v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings());

  IF COALESCE(v_license ->> 'enrollment', 'subscription') = 'legacy' THEN
    RETURN public.company_license_snapshot(v_company_id);
  END IF;

  IF COALESCE(v_license ->> 'status', '') = 'trial' THEN
    IF NULLIF(v_license ->> 'trial_ends_at', '')::timestamptz <= now() THEN
      v_license := v_license || jsonb_build_object('status', 'expired');
      UPDATE public.companies
      SET
        settings = jsonb_set(v_settings, '{license}', v_license, true),
        updated_at = now()
      WHERE id = v_company_id;
      RETURN public.company_license_snapshot(v_company_id);
    END IF;
    RETURN public.company_license_snapshot(v_company_id);
  END IF;

  IF COALESCE(v_license ->> 'status', 'pending_trial') <> 'pending_trial' THEN
    RETURN public.company_license_snapshot(v_company_id);
  END IF;

  v_catalog := public.license_catalog_row();
  v_trial_days := COALESCE(v_catalog.trial_days, 30);

  v_license := v_license || jsonb_build_object(
    'status', 'trial',
    'trial_started_at', to_jsonb(now()),
    'trial_ends_at', to_jsonb(now() + make_interval(days => v_trial_days))
  );

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = v_company_id;

  RETURN public.company_license_snapshot(v_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_company_module_access(p_module_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_period DATE := date_trunc('month', now())::date;
BEGIN
  IF p_module_key IS NULL OR trim(p_module_key) = '' THEN
    RETURN;
  END IF;

  SELECT p.company_id
  INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL OR public.is_global_admin() THEN
    RETURN;
  END IF;

  INSERT INTO public.company_module_usage (company_id, module_key, period_month, access_count, last_accessed_at)
  VALUES (v_company_id, trim(p_module_key), v_period, 1, now())
  ON CONFLICT (company_id, module_key, period_month)
  DO UPDATE SET
    access_count = public.company_module_usage.access_count + 1,
    last_accessed_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_set_company_license(
  p_company_id UUID,
  p_status TEXT,
  p_base_active BOOLEAN,
  p_modules JSONB DEFAULT '{}'::jsonb
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
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  IF p_status NOT IN ('pending_trial', 'trial', 'active', 'expired') THEN
    RAISE EXCEPTION 'Virheellinen lisenssitila';
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
  v_modules := COALESCE(v_license -> 'modules', '{}'::jsonb) || COALESCE(p_modules, '{}'::jsonb);

  v_license := v_license || jsonb_build_object(
    'enrollment', 'subscription',
    'status', p_status,
    'base_active', COALESCE(p_base_active, false),
    'modules', v_modules
  );

  v_billing := COALESCE(v_settings -> 'billing', '{}'::jsonb);
  v_billing := v_billing || jsonb_build_object(
    'module_enabled', COALESCE((v_modules ->> 'billing')::boolean, false)
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

CREATE OR REPLACE FUNCTION public.global_admin_update_license_catalog(
  p_trial_days INT,
  p_base_monthly_eur NUMERIC,
  p_module_prices JSONB
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
    updated_at = now()
  WHERE id = 1;

  RETURN (SELECT c FROM public.license_catalog c WHERE c.id = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET must_change_password = false
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_create_company(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_slug TEXT;
  v_id UUID;
  v_settings JSONB;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Yrityksen nimi on pakollinen';
  END IF;

  v_slug := public.normalize_company_slug(coalesce(nullif(trim(p_slug), ''), v_name));
  IF v_slug = '' OR v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Virheellinen tunniste (slug). Käytä pieniä kirjaimia, numeroita ja viivaa.';
  END IF;

  v_settings := jsonb_build_object(
    'license', public.default_company_license_settings(),
    'billing', jsonb_build_object('module_enabled', false)
  );

  INSERT INTO companies (name, slug, partnership_discoverable, settings)
  VALUES (v_name, v_slug, true, v_settings)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Yrityksen tunniste "%" on jo käytössä', v_slug;
END;
$$;

-- Existing tenants: full access (no forced trial).
UPDATE public.companies
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{license}',
  public.legacy_company_license_settings(),
  true
)
WHERE settings -> 'license' IS NULL;

REVOKE ALL ON FUNCTION public.license_catalog_row() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_catalog_row() TO authenticated;
REVOKE ALL ON FUNCTION public.default_company_license_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_company_license_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.legacy_company_license_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legacy_company_license_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.company_license_settings(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_license_settings(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.effective_company_license_status(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_company_license_status(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.company_module_allowed(JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_module_allowed(JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.company_license_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_license_snapshot(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.start_company_trial_on_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_company_trial_on_login() TO authenticated;
REVOKE ALL ON FUNCTION public.record_company_module_access(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_company_module_access(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.global_admin_set_company_license(UUID, TEXT, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_set_company_license(UUID, TEXT, BOOLEAN, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.global_admin_update_license_catalog(INT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_update_license_catalog(INT, NUMERIC, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;

GRANT SELECT ON public.license_catalog TO authenticated;
