-- Kumppaniraportin kulurivit: erottele kumppanin piikki (ei keskinäistä laskutusta).

ALTER TABLE work_report_daily_expense_lines
  ADD COLUMN IF NOT EXISTS bill_to_partner BOOLEAN NOT NULL DEFAULT true;
