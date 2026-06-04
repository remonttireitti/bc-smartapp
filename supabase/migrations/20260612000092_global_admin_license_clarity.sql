-- GBA: clearer license overview (login/trial), trial extension, enrollment switch.

DROP FUNCTION IF EXISTS public.global_admin_set_company_license(
  UUID, TEXT, BOOLEAN, JSONB, TEXT, TEXT, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.global_admin_extend_company_trial(
  p_company_id UUID,
  p_extra_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_license JSONB;
  v_catalog public.license_catalog;
  v_days INT;
  v_end TIMESTAMPTZ;
  v_started TIMESTAMPTZ;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  v_days := GREATEST(COALESCE(p_extra_days, 30), 1);
  v_catalog := public.license_catalog_row();

  SELECT COALESCE(settings, '{}'::jsonb)
  INTO v_settings
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings());

  IF COALESCE(v_license ->> 'enrollment', 'subscription') = 'legacy' THEN
    RAISE EXCEPTION 'Legacy-yrityksellä ei ole kokeilujaksoa. Vaihda ensin tilausmalliin.';
  END IF;

  v_started := COALESCE(NULLIF(v_license ->> 'trial_started_at', '')::timestamptz, now());
  v_end := COALESCE(NULLIF(v_license ->> 'trial_ends_at', '')::timestamptz, now());

  IF v_end < now() THEN
    v_end := now();
  END IF;

  v_license := v_license || jsonb_build_object(
    'enrollment', 'subscription',
    'status', 'trial',
    'trial_started_at', to_jsonb(v_started),
    'trial_ends_at', to_jsonb(v_end + make_interval(days => v_days))
  );

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = p_company_id;

  RETURN public.company_license_snapshot(p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_set_company_enrollment(
  p_company_id UUID,
  p_enrollment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_license JSONB;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  IF p_enrollment NOT IN ('legacy', 'subscription') THEN
    RAISE EXCEPTION 'Virheellinen malli (legacy / subscription)';
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb)
  INTO v_settings
  FROM public.companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  IF p_enrollment = 'legacy' THEN
    v_license := public.legacy_company_license_settings();
  ELSIF COALESCE(v_settings -> 'license' ->> 'enrollment', 'subscription') = 'legacy' THEN
    v_license := public.default_company_license_settings();
  ELSE
    v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings())
      || jsonb_build_object('enrollment', 'subscription');
  END IF;

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = p_company_id;

  RETURN public.company_license_snapshot(p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_set_company_license(
  p_company_id UUID,
  p_status TEXT,
  p_base_active BOOLEAN,
  p_modules JSONB DEFAULT '{}'::jsonb,
  p_billing_interval TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_activate_pending_order BOOLEAN DEFAULT false,
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL
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
  v_catalog public.license_catalog;
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

  v_catalog := public.license_catalog_row();

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
      'enrollment', 'subscription',
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

    IF p_status = 'pending_trial' THEN
      v_license := v_license || jsonb_build_object(
        'trial_started_at', NULL,
        'trial_ends_at', NULL
      );
    ELSIF p_status = 'trial' THEN
      IF NULLIF(v_license ->> 'trial_started_at', '') IS NULL THEN
        v_license := v_license || jsonb_build_object('trial_started_at', to_jsonb(now()));
      END IF;
      IF p_trial_ends_at IS NOT NULL THEN
        v_license := v_license || jsonb_build_object('trial_ends_at', to_jsonb(p_trial_ends_at));
      ELSIF NULLIF(v_license ->> 'trial_ends_at', '') IS NULL THEN
        v_license := v_license || jsonb_build_object(
          'trial_ends_at', to_jsonb(now() + make_interval(days => COALESCE(v_catalog.trial_days, 30)))
        );
      END IF;
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
      'company_created_at', c.created_at,
      'user_count', stats.user_count,
      'last_sign_in_at', stats.last_sign_in_at,
      'has_logged_in', stats.has_logged_in,
      'license_settings', public.company_license_settings(c.id),
      'snapshot', public.company_license_snapshot(c.id)
    ) AS row_data,
    c.name AS company_name
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(p.id)::int AS user_count,
        MAX(u.last_sign_in_at) AS last_sign_in_at,
        BOOL_OR(u.last_sign_in_at IS NOT NULL) AS has_logged_in
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.company_id = c.id
    ) stats ON true
  ) sub;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.global_admin_extend_company_trial(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_extend_company_trial(UUID, INT) TO authenticated;
-- enrollment RPC signature finalized in 20260613000093 (preserve_legacy param).
REVOKE ALL ON FUNCTION public.global_admin_set_company_license(
  UUID, TEXT, BOOLEAN, JSONB, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_set_company_license(
  UUID, TEXT, BOOLEAN, JSONB, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) TO authenticated;
