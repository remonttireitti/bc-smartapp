-- Valmiit huoltoraportit tilaajalle: normalisoi status, synkronoi tilaaja aina asiakkaasta.

UPDATE maintenance_reports
SET status = 'submitted'
WHERE status IS DISTINCT FROM 'draft'
  AND status IS DISTINCT FROM 'submitted'
  AND (
    completed_at IS NOT NULL
    OR lower(trim(status)) IN ('completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done')
  );

UPDATE maintenance_reports mr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE mr.customer_id = c.id
  AND c.subscriber_id IS NOT NULL
  AND mr.subscriber_id IS DISTINCT FROM c.subscriber_id;

CREATE OR REPLACE FUNCTION public.sync_report_subscriber_from_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cust_subscriber UUID;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.subscriber_id INTO cust_subscriber
  FROM customers c
  WHERE c.id = NEW.customer_id;

  NEW.subscriber_id := cust_subscriber;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS maintenance_reports_select ON maintenance_reports;
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND status IN ('submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done')
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done')
      ELSE
        public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'maintenance_reports'
        )
    END
  );
