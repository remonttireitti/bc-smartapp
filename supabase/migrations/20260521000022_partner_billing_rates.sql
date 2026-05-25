-- Partner-specific billing rates + per-report overrides

ALTER TABLE company_partnerships
  ADD COLUMN IF NOT EXISTS billing_rates_a_to_b JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS billing_rates_b_to_a JSONB NOT NULL DEFAULT '{}';

ALTER TABLE work_report_billable
  ADD COLUMN IF NOT EXISTS billing_rates_override JSONB,
  ADD COLUMN IF NOT EXISTS use_custom_rates BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_partnership_billing_rates_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_company_admin() THEN
    RETURN NEW;
  END IF;

  IF cid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.company_a_id = cid THEN
    IF NEW.billing_rates_b_to_a IS DISTINCT FROM OLD.billing_rates_b_to_a THEN
      RAISE EXCEPTION 'Voit muokata vain hintoja, joilla laskutat kumppanin yritystä';
    END IF;
  ELSIF NEW.company_b_id = cid THEN
    IF NEW.billing_rates_a_to_b IS DISTINCT FROM OLD.billing_rates_a_to_b THEN
      RAISE EXCEPTION 'Voit muokata vain hintoja, joilla laskutat kumppanin yritystä';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partnerships_billing_rates_ownership ON company_partnerships;
CREATE TRIGGER partnerships_billing_rates_ownership
  BEFORE UPDATE ON company_partnerships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_partnership_billing_rates_ownership();
