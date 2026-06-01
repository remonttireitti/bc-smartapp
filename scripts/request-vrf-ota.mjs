/**
 * Queue OTA for a VRF monitor by device_key (production Supabase).
 * Usage: node scripts/request-vrf-ota.mjs [device_key]
 * Requires: npx supabase login + linked project, or SUPABASE_SERVICE_ROLE_KEY env.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const DEVICE_KEY = process.argv[2]?.trim() || '383519714695';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qvqmemeexberatbqxivw.supabase.co';
const OTA_URL =
  process.env.VRF_OTA_URL ?? 'https://bc-smartapp.vercel.app/vrf-firmware/firmware.bin';

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('npx supabase projects api-keys --project-ref qvqmemeexberatbqxivw -o json', {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  const row = keys.find((k) => k.name === 'service_role');
  if (!row?.api_key) throw new Error('service_role key not found');
  return row.api_key;
}

const admin = createClient(SUPABASE_URL, serviceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: device, error: fetchError } = await admin
  .from('vrf_devices')
  .select('id, name, device_key, settings, firmware_version, last_seen_at')
  .eq('device_key', DEVICE_KEY)
  .maybeSingle();

if (fetchError || !device) {
  console.error(fetchError?.message ?? `Device not found: ${DEVICE_KEY}`);
  process.exit(1);
}

const base =
  device.settings && typeof device.settings === 'object' && !Array.isArray(device.settings)
    ? { ...device.settings }
    : {};
const nonce = Math.floor(Date.now() / 1000);
const settings = {
  ...base,
  ota_request: { nonce, url: OTA_URL },
};

const { error: updateError } = await admin
  .from('vrf_devices')
  .update({
    settings,
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
      device_key: device.device_key,
      current_firmware: device.firmware_version,
      last_seen_at: device.last_seen_at,
      ota_url: OTA_URL,
      ota_nonce: nonce,
    },
    null,
    2,
  ),
);
