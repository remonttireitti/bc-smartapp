/**
 * VRF-hälytyssähköpostien vastaanottajat. Tallennetaan laitteen asetuksiin (vrf_devices.settings):
 *   notify_mail_subscribers: [{ email, deviation, … }], notify_recipients_managed: true
 * Lähettäjä: Supabase edge-funktio vrf-monitor-ingest → _shared/vrfAlarmNotify.ts (Resend).
 * Sama tulkinta kuin parseMailSubscribers — testi scripts/test-vrf-alarm-recipients.mjs vertaa.
 */

export const VRF_ALARM_DEFAULT_EMAIL = 'huolto@tuusulankylmahuolto.fi';

export type VrfAlarmRecipient = {
  email: string;
  /** Hälytys- ja poistumisviestit. */
  deviation: boolean;
  defrost_start?: boolean;
  outdoor_lock_on?: boolean;
  connectivity?: boolean;
};

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function normalizeVrfEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidVrfEmail(raw: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(normalizeVrfEmail(raw));
}

/** Kenelle hälytys nyt lähtee (sama sääntö kuin palvelimella). */
export function effectiveVrfAlarmRecipients(settings: unknown): VrfAlarmRecipient[] {
  const s = asRecord(settings) ?? {};
  const byEmail = new Map<string, VrfAlarmRecipient>();
  const add = (email: string, flags: Partial<VrfAlarmRecipient>) => {
    const key = normalizeVrfEmail(email);
    if (!key.includes('@')) return;
    const prev = byEmail.get(key);
    byEmail.set(key, {
      email: key,
      deviation: Boolean(prev?.deviation || flags.deviation),
      defrost_start: Boolean(prev?.defrost_start || flags.defrost_start) || undefined,
      outdoor_lock_on: Boolean(prev?.outdoor_lock_on || flags.outdoor_lock_on) || undefined,
      connectivity: Boolean(prev?.connectivity || flags.connectivity) || undefined,
    });
  };
  const all = { deviation: true, defrost_start: true, outdoor_lock_on: true, connectivity: true };

  if (Array.isArray(s.notify_mail_subscribers)) {
    for (const entry of s.notify_mail_subscribers) {
      const row = asRecord(entry);
      const email = str(row?.email);
      if (!row || !email) continue;
      add(email, {
        deviation: row.deviation === true,
        defrost_start: row.defrost_start === true,
        outdoor_lock_on: row.outdoor_lock_on === true,
        connectivity: row.connectivity === true,
      });
    }
  }
  if (s.notify_recipients_managed === true) {
    if (![...byEmail.values()].some((r) => r.deviation)) add(VRF_ALARM_DEFAULT_EMAIL, all);
    return [...byEmail.values()];
  }
  const legacy = str(s.notify_email);
  if (legacy) {
    add(legacy, {
      deviation: s.notify_enabled === true,
      defrost_start: s.notify_email_defrost_start === true,
      outdoor_lock_on: s.notify_email_outdoor_lock_on === true,
      connectivity: s.connectivity === true || s.notify_connectivity_emails_enabled === true,
    });
  }
  const extra = str(s.notify_extra_emails);
  if (extra) {
    for (const e of extra.split(/[\n,;]+/)) {
      const t = e.trim().toLowerCase();
      if (t.includes('@')) add(t, { deviation: s.notify_enabled === true });
    }
  }
  add(VRF_ALARM_DEFAULT_EMAIL, all);
  return [...byEmail.values()];
}

/** Uudet asetukset: lista sovelluksesta on ainoa lähde, vanhat kentät pois. Muut avaimet säilyvät. */
export function buildVrfAlarmRecipientSettings(current: unknown, recipients: VrfAlarmRecipient[]): Rec {
  const base = { ...(asRecord(current) ?? {}) };
  delete base.notify_email;
  delete base.notify_extra_emails;
  const seen = new Set<string>();
  const list: VrfAlarmRecipient[] = [];
  for (const r of recipients) {
    const email = normalizeVrfEmail(r.email);
    if (!isValidVrfEmail(email) || seen.has(email)) continue;
    seen.add(email);
    list.push({
      email,
      deviation: r.deviation === true,
      ...(r.defrost_start ? { defrost_start: true } : {}),
      ...(r.outdoor_lock_on ? { outdoor_lock_on: true } : {}),
      ...(r.connectivity ? { connectivity: true } : {}),
    });
  }
  return { ...base, notify_mail_subscribers: list, notify_recipients_managed: true };
}
