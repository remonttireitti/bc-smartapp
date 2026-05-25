-- Owner company sets rates the partner charges them (billed party edits the rate field).

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

  -- billing_rates_a_to_b = company A bills company B → only B (billed) may edit.
  IF NEW.company_b_id = cid THEN
    IF NEW.billing_rates_b_to_a IS DISTINCT FROM OLD.billing_rates_b_to_a THEN
      RAISE EXCEPTION 'Voit muokata vain kumppanin hintaa, jolla kumppani laskuttaa teitä';
    END IF;
  ELSIF NEW.company_a_id = cid THEN
    IF NEW.billing_rates_a_to_b IS DISTINCT FROM OLD.billing_rates_a_to_b THEN
      RAISE EXCEPTION 'Voit muokata vain kumppanin hintaa, jolla kumppani laskuttaa teitä';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
