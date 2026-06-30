-- Korjaa kokeilun jatko: tallennus uudelleen trial-tilaan päivittää päättyneen jakson.

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
  v_existing_trial_end TIMESTAMPTZ;
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

  IF COALESCE(v_license ->> 'enrollment', 'subscription') = 'legacy' AND p_status IN ('pending_trial', 'trial', 'expired') THEN
    RAISE EXCEPTION 'Vanha sopimus -yrityksellä ei ole kokeilujaksoa. Vaihda ensin tilausmalliin.';
  END IF;

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
      ELSE
        v_existing_trial_end := NULLIF(v_license ->> 'trial_ends_at', '')::timestamptz;
        IF v_existing_trial_end IS NULL OR v_existing_trial_end <= now() THEN
          v_license := v_license || jsonb_build_object(
            'trial_ends_at', to_jsonb(now() + make_interval(days => COALESCE(v_catalog.trial_days, 30)))
          );
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = p_company_id;

  RETURN public.company_license_snapshot(p_company_id);
END;
$$;
