-- Kylmäaineen välitys: varastosta otettu kylmäaine kumppaniraportilla, omistajalle myynti ilman varaston jälkiä.

ALTER TABLE work_report_refrigerant_lines
  ADD COLUMN IF NOT EXISTS warehouse_cost_deducted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN work_report_refrigerant_lines.unit_price IS
  'Ostohinta €/kg (varastosta/tukkurilta). Kumppaniraportilla myynti omistajalle: customer_unit_price.';
COMMENT ON COLUMN work_report_refrigerant_lines.customer_unit_price IS
  'Myyntihinta €/kg raportin omistajayritykselle (kumppaniraportti). Tyhjä = unit_price.';
COMMENT ON COLUMN work_report_refrigerant_lines.warehouse_cost_deducted IS
  'Onko varastohankinnan kustannus vähennetty seuraavasta kumppanilaskutuksesta.';
