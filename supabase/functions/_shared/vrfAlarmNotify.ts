/**
 * VRF hälytys- ja tilasähköpostit (Resend) — korvaa Firebase sendVrfAlarmEmail* -triggerit.
 */

type JsonRecord = Record<string, unknown>;

export type VrfMailSubscriber = {
  email: string;
  deviation?: boolean;
  defrost_start?: boolean;
  outdoor_lock_on?: boolean;
  connectivity?: boolean;
};

export type VrfNotifyDelays = {
  onDelayS: number;
  offDelayS: number;
  minIntervalS: number;
};

export type VrfNotifyState = {
  alarm_active?: boolean;
  alarm_on_pending_since?: string | null;
  alarm_off_pending_since?: string | null;
  last_sent_at?: string | null;
  last_sent_kind?: string | null;
};

const DEFAULT_DELAYS: VrfNotifyDelays = {
  onDelayS: 60,
  offDelayS: 180,
  minIntervalS: 300,
};

const ADMIN_EMAIL = 'huolto@tuusulankylmahuolto.fi';

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function parseExtraEmails(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
}

export function parseNotifyDelays(settings: JsonRecord | null): VrfNotifyDelays {
  if (!settings) return DEFAULT_DELAYS;
  return {
    onDelayS: readNumber(settings.notify_on_delay_s, DEFAULT_DELAYS.onDelayS),
    offDelayS: readNumber(settings.notify_off_delay_s, DEFAULT_DELAYS.offDelayS),
    minIntervalS: readNumber(settings.notify_min_interval_s, DEFAULT_DELAYS.minIntervalS),
  };
}

export function parseNotifyState(settings: JsonRecord | null): VrfNotifyState {
  const row = asRecord(settings?.notify_state);
  return row ? (row as VrfNotifyState) : {};
}

export function parseMailSubscribers(settings: JsonRecord | null): VrfMailSubscriber[] {
  const byEmail = new Map<string, VrfMailSubscriber>();

  const add = (email: string, flags: Partial<VrfMailSubscriber>) => {
    const key = email.trim().toLowerCase();
    if (!key.includes('@')) return;
    const prev = byEmail.get(key);
    byEmail.set(key, {
      email: key,
      deviation: prev?.deviation || flags.deviation,
      defrost_start: prev?.defrost_start || flags.defrost_start,
      outdoor_lock_on: prev?.outdoor_lock_on || flags.outdoor_lock_on,
      connectivity: prev?.connectivity || flags.connectivity,
    });
  };

  const rawSubs = settings?.notify_mail_subscribers;
  if (Array.isArray(rawSubs)) {
    for (const entry of rawSubs) {
      const row = asRecord(entry);
      if (!row) continue;
      const email = readString(row.email);
      if (!email) continue;
      add(email, {
        deviation: row.deviation === true,
        defrost_start: row.defrost_start === true,
        outdoor_lock_on: row.outdoor_lock_on === true,
        connectivity: row.connectivity === true,
      });
    }
  }

  const legacyEmail = readString(settings?.notify_email);
  if (legacyEmail) {
    add(legacyEmail, {
      deviation: settings?.notify_enabled === true,
      defrost_start: settings?.notify_email_defrost_start === true,
      outdoor_lock_on: settings?.notify_email_outdoor_lock_on === true,
      connectivity: settings?.connectivity === true ||
        settings?.notify_connectivity_emails_enabled === true,
    });
  }

  const extra = readString(settings?.notify_extra_emails);
  if (extra) {
    for (const email of parseExtraEmails(extra)) {
      add(email, { deviation: settings?.notify_enabled === true });
    }
  }

  add(ADMIN_EMAIL, {
    deviation: true,
    defrost_start: true,
    outdoor_lock_on: true,
    connectivity: true,
  });

  return [...byEmail.values()];
}

function recipientsFor(
  subscribers: VrfMailSubscriber[],
  flag: keyof Pick<
    VrfMailSubscriber,
    'deviation' | 'defrost_start' | 'outdoor_lock_on' | 'connectivity'
  >,
): string[] {
  return subscribers.filter((s) => s[flag] === true).map((s) => s.email);
}

async function sendResendEmail(params: {
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!apiKey) {
    console.warn('[vrf-notify] RESEND_API_KEY missing — skip email');
    return;
  }
  if (params.to.length === 0) return;

  const from =
    Deno.env.get('RESEND_FROM')?.trim() ||
    'VRF Seuranta <huolto@tuusulankylmahuolto.fi>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 400)}`);
  }
}

function msSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return nowMs - t;
}

function canSendNow(state: VrfNotifyState, minIntervalS: number, nowMs: number): boolean {
  const last = state.last_sent_at;
  if (!last) return true;
  return msSince(last, nowMs) >= minIntervalS * 1000;
}

export type VrfAlarmNotifyInput = {
  deviceName: string;
  deviceId: string;
  settings: JsonRecord | null;
  wasAlarm: boolean;
  nowAlarm: boolean;
  recordedAtIso: string;
  outdoorC: number | null;
};

export type VrfAlarmNotifyResult = {
  settingsPatch: JsonRecord | null;
  emailsSent: number;
};

export async function processVrfAlarmEmail(
  input: VrfAlarmNotifyInput,
): Promise<VrfAlarmNotifyResult> {
  const settings = input.settings ?? {};
  const delays = parseNotifyDelays(settings);
  const subscribers = parseMailSubscribers(settings);
  const to = recipientsFor(subscribers, 'deviation');
  const nowMs = Date.parse(input.recordedAtIso) || Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const state: VrfNotifyState = { ...parseNotifyState(settings) };
  let emailsSent = 0;

  const send = async (kind: string, subject: string, text: string) => {
    if (!canSendNow(state, delays.minIntervalS, nowMs)) {
      console.log(`[vrf-notify] skip ${kind}: min interval`);
      return;
    }
    await sendResendEmail({ to, subject, text });
    state.last_sent_at = nowIso;
    state.last_sent_kind = kind;
    emailsSent += 1;
    console.log(`[vrf-notify] sent ${kind} to ${to.join(', ')}`);
  };

  if (input.nowAlarm) {
    state.alarm_off_pending_since = null;
    if (!state.alarm_active) {
      if (!state.alarm_on_pending_since) {
        state.alarm_on_pending_since = nowIso;
      }
      if (
        msSince(state.alarm_on_pending_since, nowMs) >= delays.onDelayS * 1000
      ) {
        const outdoor =
          input.outdoorC != null ? `${input.outdoorC.toFixed(1)} °C` : '—';
        await send(
          'alarm_on',
          `[VRF hälytys] ${input.deviceName}`,
          [
            `Laite: ${input.deviceName}`,
            `Tila: ulkoinen hälytys (DI3) aktiivinen`,
            `Ulkoilma: ${outdoor}`,
            `Aika: ${new Date(nowMs).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' })}`,
            '',
            'Tarkista VRF-ohjain ja hälytyspiiri.',
            `https://bc-smartapp.pages.dev/etaseuranta/vrf/${input.deviceId}`,
          ].join('\n'),
        );
        state.alarm_active = true;
        state.alarm_on_pending_since = null;
      }
    }
  } else {
    state.alarm_on_pending_since = null;
    if (state.alarm_active) {
      if (!state.alarm_off_pending_since) {
        state.alarm_off_pending_since = nowIso;
      }
      if (
        msSince(state.alarm_off_pending_since, nowMs) >= delays.offDelayS * 1000
      ) {
        await send(
          'alarm_off',
          `[VRF] Hälytys poistui — ${input.deviceName}`,
          [
            `Laite: ${input.deviceName}`,
            `Tila: hälytys ei ole enää aktiivinen`,
            `Aika: ${new Date(nowMs).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' })}`,
            '',
            `https://bc-smartapp.pages.dev/etaseuranta/vrf/${input.deviceId}`,
          ].join('\n'),
        );
        state.alarm_active = false;
        state.alarm_off_pending_since = null;
      }
    } else {
      state.alarm_active = false;
      state.alarm_off_pending_since = null;
    }
  }

  const nextSettings: JsonRecord = {
    ...settings,
    notify_state: state as unknown as JsonRecord,
  };

  return {
    settingsPatch: nextSettings,
    emailsSent,
  };
}
