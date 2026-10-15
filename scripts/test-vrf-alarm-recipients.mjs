import assert from 'node:assert/strict';
import { parseMailSubscribers } from '../supabase/functions/_shared/vrfAlarmNotify.ts';
import {
  VRF_ALARM_DEFAULT_EMAIL,
  buildVrfAlarmRecipientSettings,
  effectiveVrfAlarmRecipients,
  isValidVrfEmail,
} from '../src/lib/vrfAlarmRecipients.ts';
import { buildVrfSettingsForSave, parseVrfSettings } from '../src/lib/vrfMonitoring.ts';

const devTo = (list) => list.filter((s) => s.deviation === true).map((s) => s.email).sort();

const cases = [
  null,
  {},
  { notify_email: 'A@x.fi', notify_enabled: true },
  { notify_email: 'a@x.fi', notify_enabled: false, notify_extra_emails: 'b@x.fi; c@x.fi' },
  { notify_mail_subscribers: [{ email: 'k@x.fi', deviation: true }, { email: 'm@x.fi', deviation: false }] },
  { notify_recipients_managed: true, notify_mail_subscribers: [{ email: 'k@x.fi', deviation: true }] },
  { notify_recipients_managed: true, notify_mail_subscribers: [] },
  { notify_recipients_managed: true, notify_mail_subscribers: [{ email: 'k@x.fi', deviation: false }], notify_email: 'old@x.fi', notify_enabled: true },
];
// Sovelluksen näyttämä lista = palvelimen lähetyslista
for (const c of cases) assert.deepEqual(devTo(effectiveVrfAlarmRecipients(c)), devTo(parseMailSubscribers(c)), JSON.stringify(c));

// Vanha tapa: oletusosoite aina mukana; hallittu lista: vain listan osoitteet
assert.ok(devTo(parseMailSubscribers({ notify_email: 'a@x.fi', notify_enabled: true })).includes(VRF_ALARM_DEFAULT_EMAIL));
assert.deepEqual(devTo(parseMailSubscribers(cases[5])), ['k@x.fi']);
// Tyhjä hallittu lista → oletusosoite (hälytys ei jää lähtemättä)
assert.deepEqual(devTo(parseMailSubscribers(cases[6])), [VRF_ALARM_DEFAULT_EMAIL]);

// Tallennus: säilyttää muut avaimet, poistaa vanhat kentät, siivoaa osoitteet
{
  const current = { auto_stop_enabled: true, notify_state: { alarm_active: true }, notify_email: 'old@x.fi', notify_extra_emails: 'z@x.fi', ota_request: { nonce: 1 } };
  const next = buildVrfAlarmRecipientSettings(current, [
    { email: ' Uusi@X.fi ', deviation: true },
    { email: 'uusi@x.fi', deviation: false },
    { email: 'huono', deviation: true },
    { email: 'b@x.fi', deviation: false, connectivity: true },
  ]);
  assert.deepEqual(next.notify_mail_subscribers, [{ email: 'uusi@x.fi', deviation: true }, { email: 'b@x.fi', deviation: false, connectivity: true }]);
  assert.equal(next.notify_recipients_managed, true);
  assert.equal(next.notify_email, undefined);
  assert.equal(next.notify_extra_emails, undefined);
  assert.deepEqual(next.notify_state, { alarm_active: true });
  assert.deepEqual(next.ota_request, { nonce: 1 });
  assert.deepEqual(devTo(parseMailSubscribers(next)), ['uusi@x.fi']);
}

assert.ok(isValidVrfEmail('a.b@c.fi'));
assert.ok(!isValidVrfEmail('a@b'));
assert.ok(!isValidVrfEmail('a b@c.fi'));

// Asetuslomakkeen tallennus ei enää nollaa hälytystilaa eikä ylikirjoita vastaanottajia
{
  const prev = {
    notify_state: { alarm_active: true, last_sent_at: '2026-10-01T00:00:00Z' },
    notify_recipients_managed: true,
    notify_mail_subscribers: [{ email: 'uusi@x.fi', deviation: true }],
    ota_request: { nonce: 'n1', url: 'u' },
  };
  const staleForm = parseVrfSettings({ notify_mail_subscribers: [{ email: 'vanha@x.fi', deviation: true }], notify_email: 'old@x.fi' });
  const saved = buildVrfSettingsForSave({ ...staleForm, auto_stop_enabled: true }, prev);
  assert.deepEqual(saved.notify_state, prev.notify_state);
  assert.deepEqual(saved.notify_mail_subscribers, prev.notify_mail_subscribers);
  assert.equal(saved.notify_email, undefined);
  assert.deepEqual(saved.ota_request, prev.ota_request);
  assert.equal(saved.auto_stop_enabled, true);
}

console.log('vrf-alarm-recipients: ok');
