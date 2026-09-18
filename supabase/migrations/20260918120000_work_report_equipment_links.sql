-- Link work reports to one or more equipment rows (retrospective + multi-device).

CREATE TABLE work_report_equipment (
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_report_id, equipment_id)
);

CREATE INDEX idx_work_report_equipment_equipment ON work_report_equipment(equipment_id);
CREATE INDEX idx_work_report_equipment_report ON work_report_equipment(work_report_id);

-- Backfill from legacy single FK.
INSERT INTO work_report_equipment (work_report_id, equipment_id, sort_order)
SELECT id, equipment_id, 0
FROM work_reports
WHERE equipment_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE work_report_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_equipment_select ON work_report_equipment FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY work_report_equipment_insert ON work_report_equipment FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_equipment_update ON work_report_equipment FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_equipment_delete ON work_report_equipment FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );
