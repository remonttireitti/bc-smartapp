-- Raporttikohtainen tilaajan portaalinäkyvyys: oletus vasta valmis, poikkeus luonnos / työn alla.

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS subscriber_portal_visibility TEXT NOT NULL DEFAULT 'when_ready';

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS subscriber_portal_visibility TEXT NOT NULL DEFAULT 'when_ready';

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS subscriber_portal_visibility TEXT NOT NULL DEFAULT 'when_ready';

ALTER TABLE work_reports
  DROP CONSTRAINT IF EXISTS work_reports_subscriber_portal_visibility_check;
ALTER TABLE work_reports
  ADD CONSTRAINT work_reports_subscriber_portal_visibility_check
  CHECK (subscriber_portal_visibility IN ('when_ready', 'as_draft', 'as_in_progress'));

ALTER TABLE quote_requests
  DROP CONSTRAINT IF EXISTS quote_requests_subscriber_portal_visibility_check;
ALTER TABLE quote_requests
  ADD CONSTRAINT quote_requests_subscriber_portal_visibility_check
  CHECK (subscriber_portal_visibility IN ('when_ready', 'as_draft', 'as_in_progress'));

ALTER TABLE maintenance_reports
  DROP CONSTRAINT IF EXISTS maintenance_reports_subscriber_portal_visibility_check;
ALTER TABLE maintenance_reports
  ADD CONSTRAINT maintenance_reports_subscriber_portal_visibility_check
  CHECK (subscriber_portal_visibility IN ('when_ready', 'as_draft', 'as_in_progress'));

CREATE OR REPLACE FUNCTION public.subscriber_portal_report_visible(
  p_visibility TEXT,
  p_status TEXT,
  p_kind TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  vis TEXT := COALESCE(NULLIF(trim(p_visibility), ''), 'when_ready');
  st TEXT := COALESCE(trim(p_status), '');
  st_lower TEXT := lower(st);
BEGIN
  IF p_kind = 'work' AND st IN ('completed', 'billed_partner', 'billed_customer') THEN
    RETURN TRUE;
  END IF;

  IF p_kind = 'quote' AND st = 'sent' THEN
    RETURN TRUE;
  END IF;

  IF p_kind = 'maintenance' AND st_lower IN (
    'submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done'
  ) THEN
    RETURN TRUE;
  END IF;

  IF vis = 'as_draft' THEN
    RETURN st_lower = 'draft';
  END IF;

  IF vis = 'as_in_progress' THEN
    IF p_kind = 'work' THEN
      RETURN st IN ('scheduled', 'in_progress', 'delegated');
    END IF;
    RETURN st_lower = 'draft';
  END IF;

  RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        (
          created_by_user_id = auth.uid()
          AND status = 'draft'
        )
        OR (
          public.report_visible_to_subscriber(subscriber_id, customer_id)
          AND public.subscriber_portal_report_visible(subscriber_portal_visibility, status::text, 'work')
        )
      WHEN public.is_customer_user() THEN
        (
          created_by_user_id = auth.uid()
          AND status = 'draft'
        )
        OR (
          customer_id = public.current_customer_id()
          AND public.subscriber_portal_report_visible(subscriber_portal_visibility, status::text, 'work')
        )
      ELSE
        delegate_company_id = public.current_company_id()
        OR public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'work_reports'
        )
    END
  );

DROP POLICY IF EXISTS quote_requests_select ON quote_requests;
CREATE POLICY quote_requests_select ON quote_requests FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND public.subscriber_portal_report_visible(subscriber_portal_visibility, status, 'quote')
      WHEN public.is_customer_user() THEN false
      ELSE public.can_read_partner_report(
        owner_company_id,
        created_by_company_id,
        customer_id,
        'quotes'
      )
    END
  );

DROP POLICY IF EXISTS maintenance_reports_select ON maintenance_reports;
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND public.subscriber_portal_report_visible(subscriber_portal_visibility, status, 'maintenance')
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND public.subscriber_portal_report_visible(subscriber_portal_visibility, status, 'maintenance')
      ELSE
        public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'maintenance_reports'
        )
    END
  );
