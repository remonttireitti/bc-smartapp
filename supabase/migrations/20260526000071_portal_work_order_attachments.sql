-- Tilaaja/asiakas: kuvat ja liitteet omiin työtilauksiin (luonnos) + luku valmiista raporteista.

CREATE OR REPLACE FUNCTION public.can_access_work_report_image(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID := public.storage_report_id(object_name);
  segment TEXT := split_part(object_name, '/', 2);
  lid UUID;
BEGIN
  IF rid IS NULL OR segment IS NULL OR segment = '' THEN
    RETURN false;
  END IF;

  IF segment = 'attachments' THEN
    RETURN EXISTS (
      SELECT 1
      FROM work_reports w
      WHERE w.id = rid
        AND (
          (
            public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
            AND NOT public.is_customer_user()
            AND NOT public.is_subscriber_user()
          )
          OR (
            w.created_by_user_id = auth.uid()
            AND w.status = 'draft'
            AND (public.is_subscriber_user() OR public.is_customer_user())
          )
          OR (
            public.is_subscriber_user()
            AND public.report_visible_to_subscriber(w.subscriber_id, w.customer_id)
            AND w.status IN ('completed', 'billed_partner', 'billed_customer')
          )
          OR (
            public.is_customer_user()
            AND w.customer_id = public.current_customer_id()
            AND w.status IN ('completed', 'billed_partner', 'billed_customer')
          )
        )
    );
  END IF;

  lid := segment::uuid;

  RETURN EXISTS (
    SELECT 1
    FROM work_report_daily_logs dl
    JOIN work_reports w ON w.id = dl.work_report_id
    WHERE dl.id = lid
      AND w.id = rid
      AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
      AND NOT public.is_customer_user()
      AND NOT public.is_subscriber_user()
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

DROP POLICY IF EXISTS work_report_attachments_select ON work_report_attachments;
CREATE POLICY work_report_attachments_select ON work_report_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM work_reports w
      WHERE w.id = work_report_id
        AND (
          public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
          OR (
            w.created_by_user_id = auth.uid()
            AND (public.is_subscriber_user() OR public.is_customer_user())
          )
          OR (
            public.is_subscriber_user()
            AND public.report_visible_to_subscriber(w.subscriber_id, w.customer_id)
            AND w.status IN ('completed', 'billed_partner', 'billed_customer')
          )
          OR (
            public.is_customer_user()
            AND w.customer_id = public.current_customer_id()
            AND w.status IN ('completed', 'billed_partner', 'billed_customer')
          )
        )
    )
  );

DROP POLICY IF EXISTS work_report_attachments_insert ON work_report_attachments;
CREATE POLICY work_report_attachments_insert ON work_report_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM work_reports w
        WHERE w.id = work_report_id
          AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
          AND NOT public.is_customer_user()
          AND NOT public.is_subscriber_user()
      )
      OR public.portal_work_order_update_ok(work_report_id)
    )
  );

DROP POLICY IF EXISTS work_report_attachments_delete ON work_report_attachments;
CREATE POLICY work_report_attachments_delete ON work_report_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
        AND NOT public.is_customer_user()
        AND NOT public.is_subscriber_user()
    )
    OR public.portal_work_order_update_ok(work_report_id)
  );
