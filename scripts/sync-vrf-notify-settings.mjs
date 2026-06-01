/**
 * Kopioi Firebase RTDB notify-asetukset Supabase vrf_devices.settings -kenttään.
 * Usage: node scripts/sync-vrf-notify-settings.mjs [device_key]
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const DEVICE_KEY = process.argv[2]?.trim() || '383519714695';
const FIREBASE_DEVICE_ID = 'vrf-heating-01';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qvqmemeexberatbqxivw.supabase.co';

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('npx supabase projects api-keys --project-ref qvqmemeexberatbqxivw -o json', {
    encoding: 'utf8',
  });
  const row = JSON.parse(raw).find((k) => k.name === 'service_role');
  if (!row?.api_key) throw new Error('service_role key not found');
  return row.api_key;
}

const fbRaw = execSync(
  `firebase database:get /vrf/${FIREBASE_DEVICE_ID}/settings --project hyrylavrf`,
  { encoding: 'utf8' },
);
const fb = JSON.parse(fbRaw.trim());

const admin = createClient(SUPABASE_URL, serviceKey());
const { data: device, error } = await admin
  .from('vrf_devices')
  .select('id, name, settings')
  .eq('device_key', DEVICE_KEY)
  .maybeSingle();

if (error || !device) {
  console.error(error?.message ?? 'Device not found');
  process.exit(1);
}

const base =
  device.settings && typeof device.settings === 'object' && !Array.isArray(device.settings)
    ? { ...device.settings }
    : {};

const merged = {
  ...base,
  notify_mail_subscribers: fb.notify_mail_subscribers ?? base.notify_mail_subscribers,
  notify_on_delay_s: fb.notify_on_delay_s ?? base.notify_on_delay_s,
  notify_off_delay_s: fb.notify_off_delay_s ?? base.notify_off_delay_s,
  notify_min_interval_s: fb.notify_min_interval_s ?? base.notify_min_interval_s,
  notify_enabled: fb.notify_enabled ?? base.notify_enabled,
  notify_email: fb.notify_email ?? base.notify_email,
  notify_extra_emails: fb.notify_extra_emails ?? base.notify_extra_emails,
};

const { error: updateError } = await admin
  .from('vrf_devices')
  .update({
    settings: merged,
    settings_updated_at: new Date().toISOString(),
  })
  .eq('id', device.id);

if (updateError) {
  console.error(updateError.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      device: device.name,
      subscribers: merged.notify_mail_subscribers,
      delays: {
        on: merged.notify_on_delay_s,
        off: merged.notify_off_delay_s,
        min: merged.notify_min_interval_s,
      },
    },
    null,
    2,
  ),
);
