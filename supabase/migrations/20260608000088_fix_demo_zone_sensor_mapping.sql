-- Korjaa demo-laitteen anturikohdistus (kylmiö = anturi 2, pakastin = anturi 1).

UPDATE public.temp_devices
SET zone_config = jsonb_set(
  jsonb_set(
    COALESCE(zone_config, '{}'::jsonb),
    '{k1,sensor}',
    '2'::jsonb,
    true
  ),
  '{pakastin,sensor}',
  '1'::jsonb,
  true
)
WHERE is_shared_demo = true;
