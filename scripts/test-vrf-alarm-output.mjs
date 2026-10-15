import assert from 'node:assert/strict';
import {
  parseVrfSettings,
  buildVrfSettingsForSave,
  vrfAlarmRelayStatus,
  formatVrfAlarmRelayStatus,
  vrfFirmwareAtLeast,
  VRF_ONLINE_THRESHOLD_MS,
  VRF_STALE_THRESHOLD_MS,
} from '../src/lib/vrfMonitoring.ts';

const d = parseVrfSettings({});
assert.equal(d.alarm_output_enabled, true);
assert.equal(d.alarm_output_mode, 'NO');
assert.equal(d.alarm_output_channel, 8);
const p = parseVrfSettings({ alarm_output_mode: ' nc ', alarm_output_channel: 1, alarm_output_enabled: false });
assert.equal(p.alarm_output_mode, 'NC');
assert.equal(p.alarm_output_channel, 8, 'CH1 rejected');
assert.equal(p.alarm_output_enabled, false);

const prev = { notify_mail_subscribers: ['a@b.fi'], notify_recipients_managed: true, notify_state: { x: 1 }, foo: 'bar' };
const saved = buildVrfSettingsForSave({ ...parseVrfSettings(prev), alarm_output_mode: 'NC', alarm_output_channel: 5 }, prev);
assert.equal(saved.alarm_output_mode, 'NC');
assert.equal(saved.alarm_output_channel, 5);
assert.deepEqual(saved.notify_mail_subscribers, ['a@b.fi']);
assert.equal(saved.foo, 'bar');

// 1.1.16 telemetry
const old = vrfAlarmRelayStatus({ control: { enabled: true }, diagnostics: { alarm_relay_energized: false, alarm_relay_channel: 8 } });
assert.equal(old.mode, null);
assert.equal(formatVrfAlarmRelayStatus(old), 'Hälytyslähtö CH8 (NO): lepo — normaali');
// 1.1.17 NC normal
const nc = vrfAlarmRelayStatus({ control: { enabled: true, alarm_output: { enabled: true, mode: 'NC', channel: 6, energized: true, alarm_active: false, write_ok: true } }, diagnostics: {} });
assert.equal(formatVrfAlarmRelayStatus(nc), 'Hälytyslähtö CH6 (NC): vetää — normaali');

assert.ok(vrfFirmwareAtLeast('1.1.17', '1.1.17'));
assert.ok(!vrfFirmwareAtLeast('1.1.16', '1.1.17'));
assert.ok(vrfFirmwareAtLeast('v1.2.0', '1.1.17'));
assert.ok(VRF_ONLINE_THRESHOLD_MS >= 5 * 60000 && VRF_STALE_THRESHOLD_MS >= 150000);
console.log('vrf alarm output: ok');
