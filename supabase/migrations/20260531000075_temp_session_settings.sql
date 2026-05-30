-- Session monitoring settings: target range, deviation tolerance and time

ALTER TABLE temp_monitor_sessions
  ADD COLUMN monitor_label TEXT,
  ADD COLUMN target_temp_min NUMERIC(5, 2),
  ADD COLUMN target_temp_max NUMERIC(5, 2),
  ADD COLUMN allowed_deviation_c NUMERIC(4, 2),
  ADD COLUMN allowed_deviation_minutes INTEGER;

COMMENT ON COLUMN temp_monitor_sessions.monitor_label IS 'Mitä seurataan, esim. kylmiön tai pakastimen lämpötila';
COMMENT ON COLUMN temp_monitor_sessions.target_temp_min IS 'Toivottu lämpötila-alue, alaraja °C';
COMMENT ON COLUMN temp_monitor_sessions.target_temp_max IS 'Toivottu lämpötila-alue, yläraja °C';
COMMENT ON COLUMN temp_monitor_sessions.allowed_deviation_c IS 'Sallittu poikkeama toivotusta alueesta °C';
COMMENT ON COLUMN temp_monitor_sessions.allowed_deviation_minutes IS 'Kuinka kauan poikkeama saa kestää minuutteina';
