-- Yrityskohtainen laskutusmoduuli: vain globaali admin voi kytkeä päälle/pois.

CREATE OR REPLACE FUNCTION public.company_billing_module_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (c.settings -> 'billing' ->> 'module_enabled')::boolean
      FROM companies c
      WHERE c.id = p_company_id
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.company_billing_module_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_billing_module_enabled(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.global_admin_set_company_billing_module(
  p_company_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_settings jsonb;
  billing jsonb;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb)
  INTO current_settings
  FROM companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  billing := COALESCE(current_settings -> 'billing', '{}'::jsonb);
  billing := billing || jsonb_build_object('module_enabled', p_enabled);

  UPDATE companies
  SET
    settings = jsonb_set(current_settings, '{billing}', billing, true),
    updated_at = now()
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.global_admin_set_company_billing_module(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_set_company_billing_module(uuid, boolean) TO authenticated;
