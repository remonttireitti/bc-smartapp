-- Valinnainen kirjaus työkalu-/varaosa-ostosta inventaarioon.

ALTER TABLE work_report_partner_purchase_lines
  ADD COLUMN IF NOT EXISTS inventory_kind TEXT
    CHECK (inventory_kind IS NULL OR inventory_kind IN ('tool', 'material')),
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_tool_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN work_report_partner_purchase_lines.inventory_kind IS
  'Valinnainen: kirjataanko osto työkaluinventaarioon (tool) vai materiaalivarastoon (material).';
COMMENT ON COLUMN work_report_partner_purchase_lines.inventory_item_id IS
  'Materiaalivaraston rivi, johon osto on kirjattu.';
COMMENT ON COLUMN work_report_partner_purchase_lines.inventory_tool_ids IS
  'Työkaluinventaarioon luodut työkalut (yksi rivi per kpl).';
