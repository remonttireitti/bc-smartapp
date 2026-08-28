-- Poista kylmäainehistorian tuplakirjaukset (work_use), jotka syntyivät kun
-- työraportin kylmäainerivi tallennettiin uudelleen ilman muutosta.

WITH line_counts AS (
  SELECT
    work_report_id,
    cylinder_id,
    ROUND(qty_kg::numeric, 3) AS qty_kg,
    refrigerant_type,
    COUNT(*)::int AS line_count
  FROM work_report_refrigerant_lines
  WHERE source IN ('warehouse', 'partner_warehouse')
    AND cylinder_id IS NOT NULL
    AND qty_kg > 0
  GROUP BY 1, 2, 3, 4
),
ranked AS (
  SELECT
    m.id,
    m.work_report_id,
    m.cylinder_id,
    ROUND(m.qty_kg::numeric, 3) AS qty_kg,
    m.refrigerant_type,
    ROW_NUMBER() OVER (
      PARTITION BY m.work_report_id, m.cylinder_id, ROUND(m.qty_kg::numeric, 3), m.refrigerant_type
      ORDER BY m.created_at ASC
    ) AS rn
  FROM refrigerant_cylinder_movements m
  WHERE m.movement_type = 'work_use'
    AND m.work_report_id IS NOT NULL
    AND m.cylinder_id IS NOT NULL
),
to_delete AS (
  SELECT r.id
  FROM ranked r
  LEFT JOIN line_counts lc
    ON lc.work_report_id = r.work_report_id
   AND lc.cylinder_id = r.cylinder_id
   AND lc.qty_kg = r.qty_kg
   AND lc.refrigerant_type = r.refrigerant_type
  WHERE r.rn > GREATEST(COALESCE(lc.line_count, 0), 1)
)
DELETE FROM refrigerant_cylinder_movements
WHERE id IN (SELECT id FROM to_delete);
