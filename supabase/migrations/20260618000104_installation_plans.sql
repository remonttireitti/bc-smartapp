-- Asennus suunnittelu — taloyhtiöselosteet tarjouspyyntö-moduulin alle

CREATE TABLE installation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branding_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES company_partnerships(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  subscriber_portal_visibility TEXT NOT NULL DEFAULT 'when_ready',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_installation_plans_owner ON installation_plans(owner_company_id);
CREATE INDEX idx_installation_plans_customer ON installation_plans(customer_id);
CREATE INDEX idx_installation_plans_updated ON installation_plans(updated_at DESC);

CREATE TRIGGER installation_plans_updated_at
  BEFORE UPDATE ON installation_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE installation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY installation_plans_select ON installation_plans FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN false
      ELSE public.can_read_partner_report(
        owner_company_id,
        created_by_company_id,
        customer_id,
        'quotes'
      )
    END
  );

CREATE POLICY installation_plans_insert ON installation_plans FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'quotes')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND NOT public.is_customer_user()
  );

CREATE POLICY installation_plans_update ON installation_plans FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'quotes')
      )
    )
  );

CREATE POLICY installation_plans_delete ON installation_plans FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'quotes')
      )
    )
  );

CREATE TABLE installation_plan_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_plan_id UUID NOT NULL REFERENCES installation_plans(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_installation_plan_attachments_plan ON installation_plan_attachments(installation_plan_id);

ALTER TABLE installation_plan_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY installation_plan_attachments_select ON installation_plan_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM installation_plans p
      WHERE p.id = installation_plan_id
        AND public.can_read_partner_report(
          p.owner_company_id,
          p.created_by_company_id,
          p.customer_id,
          'quotes'
        )
    )
  );

CREATE POLICY installation_plan_attachments_insert ON installation_plan_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM installation_plans p
      WHERE p.id = installation_plan_id
        AND (
          p.owner_company_id = public.current_company_id()
          OR (
            p.created_by_company_id = public.current_company_id()
            AND public.can_write_module(p.owner_company_id, 'quotes')
          )
        )
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY installation_plan_attachments_delete ON installation_plan_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM installation_plans p
      WHERE p.id = installation_plan_id
        AND (
          p.owner_company_id = public.current_company_id()
          OR (
            p.created_by_company_id = public.current_company_id()
            AND public.can_write_module(p.owner_company_id, 'quotes')
          )
        )
    )
    AND NOT public.is_customer_user()
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'installation-plan-files',
  'installation-plan-files',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_installation_plan_file(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_id UUID;
BEGIN
  plan_id := NULLIF(split_part(object_name, '/', 1), '')::uuid;
  IF plan_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM installation_plans p
    WHERE p.id = plan_id
      AND public.can_read_partner_report(
        p.owner_company_id,
        p.created_by_company_id,
        p.customer_id,
        'quotes'
      )
      AND NOT public.is_customer_user()
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

DROP POLICY IF EXISTS installation_plan_files_select ON storage.objects;
CREATE POLICY installation_plan_files_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'installation-plan-files'
    AND public.can_access_installation_plan_file(name)
  );

DROP POLICY IF EXISTS installation_plan_files_insert ON storage.objects;
CREATE POLICY installation_plan_files_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'installation-plan-files'
    AND public.can_access_installation_plan_file(name)
  );

DROP POLICY IF EXISTS installation_plan_files_delete ON storage.objects;
CREATE POLICY installation_plan_files_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'installation-plan-files'
    AND public.can_access_installation_plan_file(name)
  );
