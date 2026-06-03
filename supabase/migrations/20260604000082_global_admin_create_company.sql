-- Global admin: create new tenant companies.

CREATE OR REPLACE FUNCTION public.normalize_company_slug(p_slug TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  s := lower(trim(coalesce(p_slug, '')));
  s := regexp_replace(s, '[^a-z0-9-]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  IF length(s) > 64 THEN
    s := left(s, 64);
    s := trim(both '-' from s);
  END IF;
  RETURN s;
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

  INSERT INTO companies (name, slug, partnership_discoverable)
  VALUES (v_name, v_slug, true)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Yrityksen tunniste "%" on jo käytössä', v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_company_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_company_slug(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_create_company(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_create_company(TEXT, TEXT) TO authenticated;
