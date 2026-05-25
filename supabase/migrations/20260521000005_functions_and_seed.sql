-- Search RPC + dev seed data

CREATE OR REPLACE FUNCTION public.company_search(query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  title TEXT,
  subtitle TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  tsq TSQUERY;
BEGIN
  IF cid IS NULL OR coalesce(trim(query), '') = '' THEN
    RETURN;
  END IF;

  tsq := plainto_tsquery('finnish', query);

  RETURN QUERY
  SELECT 'customer'::TEXT, c.id, c.name, coalesce(c.address, c.city)
  FROM customers c
  WHERE public.can_see_company_row(c.owner_company_id)
    AND c.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'equipment'::TEXT, e.id, e.name, e.tag
  FROM equipment e
  WHERE public.can_see_company_row(e.owner_company_id)
    AND e.search_vector @@ tsq
  LIMIT result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_search TO authenticated;

-- Auto-create profile stub (company must be set by invite flow)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.raw_user_meta_data ->> 'company_id') IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, email, display_name, role)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'company_id')::uuid,
      NEW.email,
      coalesce(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
      coalesce((NEW.raw_user_meta_data ->> 'role')::user_role, 'technician')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Dev seed (local only — safe to re-run on db reset)
DO $$
DECLARE
  company_x UUID;
  company_y UUID;
  company_z UUID;
  partnership_xy UUID;
  user_admin UUID := '00000000-0000-4000-8000-000000000001';
  cust_y UUID;
  equip_y UUID;
BEGIN
  INSERT INTO companies (id, name, slug) VALUES
    ('11111111-1111-4111-8111-111111111111', 'BC Smartapp', 'yritys-x'),
    ('22222222-2222-4222-8222-222222222222', 'Uudenmaan Kylmähuolto Oy', 'yritys-y'),
    ('33333333-3333-4333-8333-333333333333', 'Lämpökatsastus Oy', 'yritys-z'),
    ('44444444-4444-4444-8444-444444444444', 'Termatek Oy', 'termatek-oy')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO company_x FROM companies WHERE slug = 'yritys-x';
  SELECT id INTO company_y FROM companies WHERE slug = 'yritys-y';
  SELECT id INTO company_z FROM companies WHERE slug = 'yritys-z';

  INSERT INTO company_partnerships (company_a_id, company_b_id, status, permissions_a_to_b, permissions_b_to_a)
  VALUES (
    company_x, company_y, 'active',
    '{}'::jsonb,
    '{
      "create_work_reports_as_partner": true,
      "create_maintenance_reports_as_partner": true,
      "view_customers": true,
      "view_partner_reports": true,
      "use_partner_branding": true
    }'::jsonb
  )
  ON CONFLICT (company_a_id, company_b_id) DO UPDATE SET status = 'active'
  RETURNING id INTO partnership_xy;

  INSERT INTO customers (owner_company_id, name, address, city)
  VALUES (company_y, 'Asiakas Oy', 'Teollisuuskatu 1', 'Helsinki')
  ON CONFLICT DO NOTHING;

  SELECT id INTO cust_y FROM customers WHERE owner_company_id = company_y AND name = 'Asiakas Oy' LIMIT 1;

  IF cust_y IS NOT NULL THEN
    INSERT INTO equipment (owner_company_id, customer_id, tag, name)
    VALUES (company_y, cust_y, 'LAITE-001', 'Jäähdytysaggregaatti')
    ON CONFLICT DO NOTHING;

    SELECT id INTO equip_y FROM equipment WHERE tag = 'LAITE-001' AND owner_company_id = company_y LIMIT 1;

    INSERT INTO work_reports (
      owner_company_id, created_by_company_id, branding_company_id,
      partnership_id, customer_id, equipment_id, title, status,
      scheduled_start, scheduled_end, location_text
    ) VALUES (
      company_y, company_x, company_y,
      partnership_xy, cust_y, equip_y,
      'Huolto BC Smartapp → Uudenmaan Kylmähuolto', 'scheduled',
      now() + interval '1 day', now() + interval '1 day' + interval '2 hours',
      'Teollisuuskatu 1, Helsinki'
    ) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO form_templates (owner_company_id, slug, title, schema)
  VALUES (
    company_y,
    'huoltoraportti',
    'Huoltoraportti (pohja)',
    '{
      "fields": [
        {"id": "equipment_type", "type": "select", "label": "Laitetyyppi", "options": ["sähkö", "LVI", "kone"]},
        {"id": "electrical_check", "type": "checkbox", "label": "Sähkötarkastus", "showIf": {"equipment_type": "sähkö"}},
        {"id": "pressure_test", "type": "number", "label": "Paineentestaus (bar)", "showIf": {"equipment_type": "LVI"}},
        {"id": "notes", "type": "textarea", "label": "Huomiot"}
      ]
    }'::jsonb
  ) ON CONFLICT DO NOTHING;
END;
$$;
