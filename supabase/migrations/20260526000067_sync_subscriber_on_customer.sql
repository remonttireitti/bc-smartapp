-- Kun asiakaskohde linkitetään tilaajaan, päivitä myös olemassa olevat raportit.

CREATE OR REPLACE FUNCTION public.sync_customer_subscriber_to_reports()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id THEN
    UPDATE maintenance_reports
    SET subscriber_id = NEW.subscriber_id
    WHERE customer_id = NEW.id
      AND (subscriber_id IS NULL OR subscriber_id IS NOT DISTINCT FROM OLD.subscriber_id);

    UPDATE work_reports
    SET subscriber_id = NEW.subscriber_id
    WHERE customer_id = NEW.id
      AND (subscriber_id IS NULL OR subscriber_id IS NOT DISTINCT FROM OLD.subscriber_id);

    UPDATE quote_requests
    SET subscriber_id = NEW.subscriber_id
    WHERE customer_id = NEW.id
      AND (subscriber_id IS NULL OR subscriber_id IS NOT DISTINCT FROM OLD.subscriber_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_sync_subscriber_reports ON customers;
CREATE TRIGGER customers_sync_subscriber_reports
  AFTER UPDATE OF subscriber_id ON customers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_subscriber_to_reports();

-- Historia: täytä raporttien tilaaja asiakkaan nykyisestä linkistä
UPDATE maintenance_reports mr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE mr.customer_id = c.id
  AND c.subscriber_id IS NOT NULL
  AND mr.subscriber_id IS DISTINCT FROM c.subscriber_id;

UPDATE work_reports wr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE wr.customer_id = c.id
  AND c.subscriber_id IS NOT NULL
  AND wr.subscriber_id IS DISTINCT FROM c.subscriber_id;

UPDATE quote_requests qr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE qr.customer_id = c.id
  AND c.subscriber_id IS NOT NULL
  AND qr.subscriber_id IS DISTINCT FROM c.subscriber_id;
