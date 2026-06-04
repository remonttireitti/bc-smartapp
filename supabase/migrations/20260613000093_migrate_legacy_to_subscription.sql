-- One-time: move legacy tenants to subscription model unless explicitly preserved.
-- In GBA: Vanha sopimus + "Pidä vanha sopimus" ennen db push, tai settings.license.preserve_legacy = true.

CREATE OR REPLACE FUNCTION public.global_admin_set_company_enrollment(
  p_company_id UUID,
  p_enrollment TEXT,
  p_preserve_legacy BOOLEAN DEFAULT false
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
    IF COALESCE(p_preserve_legacy, false) THEN
      v_license := v_license || jsonb_build_object('preserve_legacy', true);
    ELSE
      v_license := v_license || jsonb_build_object('preserve_legacy', false);
    END IF;
  ELSIF COALESCE(v_settings -> 'license' ->> 'enrollment', 'subscription') = 'legacy' THEN
    v_license := public.default_company_license_settings();
  ELSE
    v_license := COALESCE(v_settings -> 'license', public.default_company_license_settings())
      || jsonb_build_object('enrollment', 'subscription', 'preserve_legacy', false);
  END IF;

  UPDATE public.companies
  SET
    settings = jsonb_set(v_settings, '{license}', v_license, true),
    updated_at = now()
  WHERE id = p_company_id;

  RETURN public.company_license_snapshot(p_company_id);
END;
$$;

UPDATE public.companies c
SET
  settings = jsonb_set(
    COALESCE(c.settings, '{}'::jsonb),
    '{license}',
    public.default_company_license_settings(),
    true
  ),
  updated_at = now()
WHERE COALESCE(c.settings -> 'license' ->> 'enrollment', '') = 'legacy'
  AND COALESCE((c.settings -> 'license' ->> 'preserve_legacy')::boolean, false) = false;

REVOKE ALL ON FUNCTION public.global_admin_set_company_enrollment(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_set_company_enrollment(UUID, TEXT, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.global_admin_set_company_enrollment(UUID, TEXT);
