-- License overview: count staff users (same as Käyttäjät page), not portal/other roles.

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
      'user_count', stats.staff_user_count,
      'account_count', stats.account_count,
      'last_sign_in_at', stats.last_sign_in_at,
      'has_logged_in', stats.has_logged_in,
      'license_settings', public.company_license_settings(c.id),
      'snapshot', public.company_license_snapshot(c.id)
    ) AS row_data,
    c.name AS company_name
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(p.id) FILTER (
          WHERE p.role IN ('admin', 'manager', 'technician')
        )::int AS staff_user_count,
        COUNT(p.id)::int AS account_count,
        MAX(u.last_sign_in_at) FILTER (
          WHERE p.role IN ('admin', 'manager', 'technician')
        ) AS last_sign_in_at,
        BOOL_OR(u.last_sign_in_at IS NOT NULL) FILTER (
          WHERE p.role IN ('admin', 'manager', 'technician')
        ) AS has_logged_in
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.company_id = c.id
    ) stats ON true
  ) sub;

  RETURN v_rows;
END;
$$;
