-- Julkinen tulostelinkki työraportille (ei vaadi kirjautumista)

CREATE TABLE work_report_print_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL UNIQUE REFERENCES work_reports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX work_report_print_shares_token_idx
  ON work_report_print_shares (access_token)
  WHERE enabled;

CREATE INDEX work_report_print_shares_report_idx
  ON work_report_print_shares (work_report_id);

COMMENT ON TABLE work_report_print_shares IS 'Jaettu asiakastuloste ilman kirjautumista; yksi linkki per työraportti';

CREATE OR REPLACE FUNCTION public.can_manage_work_report_print_share(p_work_report_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM work_reports w
    WHERE w.id = p_work_report_id
      AND NOT public.is_customer_user()
      AND NOT public.is_subscriber_user()
      AND (
        w.delegate_company_id = public.current_company_id()
        OR public.can_read_partner_report(
          w.owner_company_id,
          w.created_by_company_id,
          w.customer_id,
          'work_reports'
        )
      )
  );
$$;

ALTER TABLE work_report_print_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_print_shares_select ON work_report_print_shares FOR SELECT
  USING (public.can_manage_work_report_print_share(work_report_id));

CREATE POLICY work_report_print_shares_insert ON work_report_print_shares FOR INSERT
  WITH CHECK (
    public.can_manage_work_report_print_share(work_report_id)
    AND company_id = public.current_company_id()
  );

CREATE POLICY work_report_print_shares_update ON work_report_print_shares FOR UPDATE
  USING (public.can_manage_work_report_print_share(work_report_id))
  WITH CHECK (public.can_manage_work_report_print_share(work_report_id));

CREATE POLICY work_report_print_shares_delete ON work_report_print_shares FOR DELETE
  USING (public.can_manage_work_report_print_share(work_report_id));
