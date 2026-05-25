-- Kylmäaineen laskutus: oman varaston/tukkurin omat hankinnat asiakkaalle, kumppanin piikki muistutuksena.

ALTER TABLE work_report_refrigerant_lines
  ADD COLUMN IF NOT EXISTS supplier_paid_by TEXT CHECK (supplier_paid_by IN ('own', 'partner')),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  ADD COLUMN IF NOT EXISTS customer_unit_price NUMERIC(12,2) CHECK (customer_unit_price IS NULL OR customer_unit_price >= 0),
  ADD COLUMN IF NOT EXISTS bill_to_customer BOOLEAN NOT NULL DEFAULT false;
