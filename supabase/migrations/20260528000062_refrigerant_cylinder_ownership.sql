-- Kylmäainepullo: omistus vs vuokra, palautusmerkintä.

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'owned';

ALTER TABLE refrigerant_cylinders
  DROP CONSTRAINT IF EXISTS refrigerant_cylinders_ownership_type_check;

ALTER TABLE refrigerant_cylinders
  ADD CONSTRAINT refrigerant_cylinders_ownership_type_check
  CHECK (ownership_type IN ('owned', 'rental'));

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS returned_at DATE;

COMMENT ON COLUMN refrigerant_cylinders.ownership_type IS 'owned = omistuspullo, rental = vuokrapullo';
COMMENT ON COLUMN refrigerant_cylinders.returned_at IS 'Vuokrapullon palautuspäivä; status returned';

-- Työraportin valinnassa ei näytetä palautettuja eikä poistettuja pulloja.
CREATE OR REPLACE FUNCTION public.list_refrigerant_cylinders_for_work_report(
  p_work_report_id UUID,
  p_include_cylinder_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  company_name TEXT,
  serial_number TEXT,
  refrigerant_type TEXT,
  purchased_kg NUMERIC,
  remaining_kg NUMERIC,
  owner_user_id UUID,
  status TEXT,
  owner_display_name TEXT,
  owner_email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.company_id,
    co.name AS company_name,
    c.serial_number,
    c.refrigerant_type,
    c.purchased_kg,
    c.remaining_kg,
    c.owner_user_id,
    c.status,
    p.display_name AS owner_display_name,
    p.email AS owner_email
  FROM public.refrigerant_cylinders c
  JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.profiles p ON p.id = c.owner_user_id
  WHERE c.company_id = ANY(public.work_report_refrigerant_company_ids(p_work_report_id))
    AND c.status NOT IN ('retired', 'returned')
    AND public.user_can_use_refrigerant_on_report(p_work_report_id)
    AND (
      c.remaining_kg > 0.005
      OR c.id = ANY(p_include_cylinder_ids)
    )
  ORDER BY co.name, c.serial_number;
$$;
