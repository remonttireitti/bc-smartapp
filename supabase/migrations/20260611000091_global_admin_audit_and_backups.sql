-- GBA: platform-wide audit log + backup snapshot registry.

CREATE TABLE public.platform_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  route TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_platform_audit_created ON public.platform_audit_events(created_at DESC);
CREATE INDEX idx_platform_audit_actor ON public.platform_audit_events(actor_user_id, created_at DESC);
CREATE INDEX idx_platform_audit_company ON public.platform_audit_events(actor_company_id, created_at DESC);
CREATE INDEX idx_platform_audit_action ON public.platform_audit_events(action, created_at DESC);

CREATE TYPE public.platform_backup_kind AS ENUM ('daily', 'weekly', 'manual');

CREATE TYPE public.platform_backup_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE public.platform_backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.platform_backup_kind NOT NULL,
  status public.platform_backup_status NOT NULL DEFAULT 'running',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  byte_size BIGINT,
  table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (storage_path <> '')
);

CREATE INDEX idx_platform_backup_kind_started
  ON public.platform_backup_snapshots(kind, started_at DESC);

ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_backup_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_audit_select_gba ON public.platform_audit_events
  FOR SELECT TO authenticated
  USING (public.is_global_admin());

CREATE POLICY platform_backup_select_gba ON public.platform_backup_snapshots
  FOR SELECT TO authenticated
  USING (public.is_global_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'platform-backups',
  'platform-backups',
  false,
  524288000,
  ARRAY['application/json', 'application/gzip', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY platform_backups_storage_gba_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'platform-backups'
    AND public.is_global_admin()
  );

CREATE OR REPLACE FUNCTION public.platform_audit_row_company_id(p_row JSONB)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(p_row->>'owner_company_id', '')::uuid,
    NULLIF(p_row->>'created_by_company_id', '')::uuid,
    NULLIF(p_row->>'company_id', '')::uuid,
    NULLIF(p_row->>'branding_company_id', '')::uuid,
    NULLIF(p_row->>'delegate_company_id', '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.record_platform_audit_event(
  p_action TEXT,
  p_summary TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT;
  v_company UUID;
  v_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Kirjautuminen vaaditaan';
  END IF;

  SELECT p.email, p.company_id
  INTO v_email, v_company
  FROM public.profiles p
  WHERE p.id = v_actor;

  INSERT INTO public.platform_audit_events (
    actor_user_id,
    actor_email,
    actor_company_id,
    action,
    summary,
    entity_type,
    entity_id,
    route,
    metadata
  )
  VALUES (
    v_actor,
    v_email,
    v_company,
    trim(p_action),
    trim(p_summary),
    NULLIF(trim(p_entity_type), ''),
    NULLIF(trim(p_entity_id), ''),
    NULLIF(trim(p_route), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_audit_data_change_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT;
  v_company UUID;
  v_row JSONB;
  v_entity_id TEXT;
  v_action TEXT;
  v_summary TEXT;
BEGIN
  IF coalesce(current_setting('app.skip_audit', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME IN ('platform_audit_events', 'platform_backup_snapshots') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.email, p.company_id INTO v_email, v_company
  FROM public.profiles p WHERE p.id = v_actor;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_entity_id := OLD.id::text;
    v_action := TG_TABLE_NAME || '.delete';
    v_summary := 'Poistettiin: ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'INSERT' THEN
    v_row := to_jsonb(NEW);
    v_entity_id := NEW.id::text;
    v_action := TG_TABLE_NAME || '.insert';
    v_summary := 'Luotiin: ' || TG_TABLE_NAME;
  ELSE
    v_row := to_jsonb(NEW);
    v_entity_id := NEW.id::text;
    v_action := TG_TABLE_NAME || '.update';
    v_summary := 'Päivitettiin: ' || TG_TABLE_NAME;
  END IF;

  v_company := COALESCE(public.platform_audit_row_company_id(v_row), v_company);

  INSERT INTO public.platform_audit_events (
    actor_user_id,
    actor_email,
    actor_company_id,
    action,
    summary,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_actor,
    v_email,
    v_company,
    v_action,
    v_summary,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object('op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_platform_audit_trigger(p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS platform_audit_%I ON public.%I',
    p_table,
    p_table
  );
  EXECUTE format(
    'CREATE TRIGGER platform_audit_%I
     AFTER INSERT OR UPDATE OR DELETE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.platform_audit_data_change_trigger()',
    p_table,
    p_table
  );
END;
$$;

SELECT public.attach_platform_audit_trigger('companies');
SELECT public.attach_platform_audit_trigger('profiles');
SELECT public.attach_platform_audit_trigger('customers');
SELECT public.attach_platform_audit_trigger('equipment');
SELECT public.attach_platform_audit_trigger('work_reports');
SELECT public.attach_platform_audit_trigger('maintenance_reports');
SELECT public.attach_platform_audit_trigger('quote_requests');
SELECT public.attach_platform_audit_trigger('company_partnerships');
SELECT public.attach_platform_audit_trigger('temp_devices');
SELECT public.attach_platform_audit_trigger('vrf_devices');
SELECT public.attach_platform_audit_trigger('inventory_items');

CREATE OR REPLACE FUNCTION public.global_admin_list_audit_events(
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_company_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_action_contains TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_rows JSON;
  v_total INT;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  SELECT COUNT(*)::INT INTO v_total
  FROM public.platform_audit_events e
  WHERE (p_company_id IS NULL OR e.actor_company_id = p_company_id)
    AND (p_actor_id IS NULL OR e.actor_user_id = p_actor_id)
    AND (
      p_action_contains IS NULL
      OR trim(p_action_contains) = ''
      OR e.action ILIKE '%' || trim(p_action_contains) || '%'
      OR e.summary ILIKE '%' || trim(p_action_contains) || '%'
    );

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      e.id,
      e.created_at,
      e.actor_user_id,
      e.actor_email,
      e.actor_company_id,
      c.name AS actor_company_name,
      e.action,
      e.summary,
      e.entity_type,
      e.entity_id,
      e.route,
      e.metadata
    FROM public.platform_audit_events e
    LEFT JOIN public.companies c ON c.id = e.actor_company_id
    WHERE (p_company_id IS NULL OR e.actor_company_id = p_company_id)
      AND (p_actor_id IS NULL OR e.actor_user_id = p_actor_id)
      AND (
        p_action_contains IS NULL
        OR trim(p_action_contains) = ''
        OR e.action ILIKE '%' || trim(p_action_contains) || '%'
        OR e.summary ILIKE '%' || trim(p_action_contains) || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) t;

  RETURN json_build_object('total', v_total, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_list_backup_snapshots(
  p_limit INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_rows JSON;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      s.id,
      s.kind,
      s.status,
      s.storage_path,
      s.file_name,
      s.byte_size,
      s.table_counts,
      s.error_message,
      s.started_at,
      s.completed_at,
      p.display_name AS created_by_name,
      p.email AS created_by_email
    FROM public.platform_backup_snapshots s
    LEFT JOIN public.profiles p ON p.id = s.created_by
    ORDER BY s.started_at DESC
    LIMIT v_limit
  ) t;

  RETURN json_build_object('rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_register_backup_snapshot(
  p_kind public.platform_backup_kind,
  p_storage_path TEXT,
  p_file_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  INSERT INTO public.platform_backup_snapshots (kind, status, storage_path, file_name, created_by)
  VALUES (p_kind, 'running', trim(p_storage_path), trim(p_file_name), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_finish_backup_snapshot(
  p_snapshot_id UUID,
  p_status public.platform_backup_status,
  p_byte_size BIGINT DEFAULT NULL,
  p_table_counts JSONB DEFAULT '{}'::jsonb,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  UPDATE public.platform_backup_snapshots
  SET
    status = p_status,
    byte_size = p_byte_size,
    table_counts = COALESCE(p_table_counts, '{}'::jsonb),
    error_message = NULLIF(trim(p_error_message), ''),
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = p_snapshot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_prune_backup_snapshots(
  p_daily_keep INT DEFAULT 14,
  p_weekly_keep INT DEFAULT 8
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_ids UUID[];
  v_weekly_ids UUID[];
  v_prune_ids UUID[];
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_daily_ids
  FROM (
    SELECT id FROM public.platform_backup_snapshots
    WHERE kind = 'daily' AND status = 'completed'
    ORDER BY started_at DESC
    OFFSET GREATEST(p_daily_keep, 1)
  ) sub;

  SELECT COALESCE(array_agg(id), '{}') INTO v_weekly_ids
  FROM (
    SELECT id FROM public.platform_backup_snapshots
    WHERE kind = 'weekly' AND status = 'completed'
    ORDER BY started_at DESC
    OFFSET GREATEST(p_weekly_keep, 1)
  ) sub;

  v_prune_ids := v_daily_ids || v_weekly_ids;

  DELETE FROM public.platform_backup_snapshots
  WHERE id = ANY(v_prune_ids);

  RETURN json_build_object(
    'pruned_count', COALESCE(array_length(v_prune_ids, 1), 0),
    'pruned_ids', v_prune_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_platform_audit_event(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_platform_audit_event(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_list_audit_events(INT, INT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_list_audit_events(INT, INT, UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_list_backup_snapshots(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_list_backup_snapshots(INT) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_register_backup_snapshot(public.platform_backup_kind, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_register_backup_snapshot(public.platform_backup_kind, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_finish_backup_snapshot(UUID, public.platform_backup_status, BIGINT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_finish_backup_snapshot(UUID, public.platform_backup_status, BIGINT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_prune_backup_snapshots(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_prune_backup_snapshots(INT, INT) TO authenticated;
