-- Laitemyyjä-ketju: urakoitsija (work_report_billable.billing_quote.contractor_company_id)
-- näkee oman laskuluonnoksensa tilaajalle ja voi merkitä sen laskutetuksi.
--
-- Vähimmät oikeudet: taulujen RLS-käytäntöihin EI muutoksia. Urakoitsija ei saa lukuoikeutta
-- work_reports-, work_report_billable- tai work_report_billing-riveihin, päiväkirjoihin eikä
-- asentajan laskelmaan. Kaksi SECURITY DEFINER -funktiota palauttavat / päivittävät vain
-- urakoitsijan laskun tiedot ja tarkistavat jokaisella kutsulla, että
--   * kutsuja on urakoitsijayrityksen henkilöstöä (admin/manager/technician; päivitys admin/manager),
--   * raportin billing_quote nimeää kutsujan yrityksen urakoitsijaksi ja laskelmassa on
--     urakoitsijan lasku (calculation.contractorInvoice.fromCompanyId = kutsujan yritys),
--   * urakoitsijalla on aktiivinen kumppanuus raportin laatijan kanssa,
--   * kutsuja ei ole raportin omistaja eikä laatija (heillä on jo omat oikeudet).

CREATE OR REPLACE FUNCTION public.contractor_chain_invoice_reports()
RETURNS TABLE (
  work_report_id uuid,
  title text,
  status text,
  completed_at timestamptz,
  scheduled_start timestamptz,
  created_at timestamptz,
  owner_company_id uuid,
  owner_company_name text,
  amount numeric,
  invoice_status text,
  billed_amount numeric,
  billed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.title,
    w.status::text,
    w.completed_at,
    w.scheduled_start,
    w.created_at,
    w.owner_company_id,
    oc.name,
    (b.calculation -> 'contractorInvoice' ->> 'amount')::numeric,
    CASE WHEN b.billing_quote -> 'contractor_invoice' ->> 'status' = 'paid' THEN 'paid' ELSE 'none' END,
    CASE WHEN b.billing_quote -> 'contractor_invoice' ->> 'status' = 'paid'
      THEN NULLIF(b.billing_quote -> 'contractor_invoice' ->> 'billed_amount', '')::numeric END,
    CASE WHEN b.billing_quote -> 'contractor_invoice' ->> 'status' = 'paid'
      THEN NULLIF(b.billing_quote -> 'contractor_invoice' ->> 'billed_at', '')::timestamptz END
  FROM work_report_billable b
  JOIN work_reports w ON w.id = b.work_report_id
  LEFT JOIN companies oc ON oc.id = w.owner_company_id
  WHERE public.current_company_id() IS NOT NULL
    AND public.current_user_role() IN ('admin', 'manager', 'technician')
    AND b.billing_quote ->> 'contractor_company_id' = public.current_company_id()::text
    AND b.calculation -> 'contractorInvoice' ->> 'fromCompanyId' = public.current_company_id()::text
    AND jsonb_typeof(b.calculation -> 'contractorInvoice' -> 'amount') = 'number'
    AND w.owner_company_id <> public.current_company_id()
    AND w.created_by_company_id <> public.current_company_id()
    AND EXISTS (
      SELECT 1
      FROM company_partnerships p
      WHERE p.status = 'active'
        AND (
          (p.company_a_id = w.created_by_company_id AND p.company_b_id = public.current_company_id())
          OR (p.company_b_id = w.created_by_company_id AND p.company_a_id = public.current_company_id())
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.set_contractor_chain_invoice_billed(
  p_work_report_id uuid,
  p_billed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_amount numeric;
  v_current jsonb;
  v_status jsonb;
BEGIN
  IF v_company IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Ei oikeutta' USING ERRCODE = '42501';
  END IF;

  SELECT (b.calculation -> 'contractorInvoice' ->> 'amount')::numeric,
         b.billing_quote -> 'contractor_invoice'
    INTO v_amount, v_current
  FROM work_report_billable b
  JOIN work_reports w ON w.id = b.work_report_id
  WHERE b.work_report_id = p_work_report_id
    AND b.billing_quote ->> 'contractor_company_id' = v_company::text
    AND b.calculation -> 'contractorInvoice' ->> 'fromCompanyId' = v_company::text
    AND jsonb_typeof(b.calculation -> 'contractorInvoice' -> 'amount') = 'number'
    AND w.owner_company_id <> v_company
    AND w.created_by_company_id <> v_company
    AND EXISTS (
      SELECT 1
      FROM company_partnerships p
      WHERE p.status = 'active'
        AND (
          (p.company_a_id = w.created_by_company_id AND p.company_b_id = v_company)
          OR (p.company_b_id = w.created_by_company_id AND p.company_a_id = v_company)
        )
    )
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ei oikeutta' USING ERRCODE = '42501';
  END IF;

  IF p_billed THEN
    -- Jo laskutettua summaa ei muuteta.
    IF v_current ->> 'status' = 'paid' THEN
      RETURN v_current;
    END IF;
    v_status := jsonb_build_object('status', 'paid', 'billed_amount', v_amount, 'billed_at', now());
    UPDATE work_report_billable
       SET billing_quote = COALESCE(billing_quote, '{}'::jsonb) || jsonb_build_object('contractor_invoice', v_status)
     WHERE work_report_id = p_work_report_id;
    RETURN v_status;
  END IF;

  UPDATE work_report_billable
     SET billing_quote = COALESCE(billing_quote, '{}'::jsonb) - 'contractor_invoice'
   WHERE work_report_id = p_work_report_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_chain_invoice_reports() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_contractor_chain_invoice_billed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_chain_invoice_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_contractor_chain_invoice_billed(uuid, boolean) TO authenticated;
