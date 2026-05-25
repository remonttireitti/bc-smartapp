-- Oletus: työntekijöiden tunnit ja kulut laskutettavissa, ellei erikseen pois kytketty.

UPDATE profiles
SET
  bill_hours_enabled = true,
  bill_expenses_enabled = true
WHERE role IN ('admin', 'manager', 'technician')
  AND bill_hours_enabled = false
  AND bill_expenses_enabled = false;
