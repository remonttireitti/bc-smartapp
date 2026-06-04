-- GBA: allow company creation when flag is in profile OR auth user_metadata.

CREATE OR REPLACE FUNCTION public.jwt_user_metadata_is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'is_global_admin')::boolean,
    (auth.jwt() -> 'user_metadata' ->> 'is_global_admin') = 'true',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_global_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
  OR public.jwt_user_metadata_is_global_admin();
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
    RAISE EXCEPTION 'Vain globaali admin voi luoda yrityksiä';
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

  INSERT INTO public.companies (name, slug, partnership_discoverable, settings)
  VALUES (v_name, v_slug, true, v_settings)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Yrityksen tunniste "%" on jo käytössä', v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.jwt_user_metadata_is_global_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jwt_user_metadata_is_global_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_global_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_create_company(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_create_company(TEXT, TEXT) TO authenticated;
