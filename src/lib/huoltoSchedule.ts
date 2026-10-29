/**
 * Huoltoväli ja F-kaasuasetuksen (EU) 2024/573 art. 5 mukainen vuototarkastusväli.
 * Lähde: https://eur-lex.europa.eu/eli/reg/2024/573/oj (art. 5(1) ja 5(6), liitteet I, II ja VI).
 * GWP: liitteen I 100 vuoden arvot (IPCC AR4); seosten GWP liitteen VI painotettuna keskiarvona.
 */

/** Liitteen I / VI mukaiset 100 v GWP-arvot (AR4). */
export const FGAS_GWP: Record<string, number> = {
  'R-23': 14800,
  'R-32': 675,
  'R-125': 3500,
  'R-134a': 1430,
  'R-143a': 4470,
  'R-152a': 124,
  'R-227ea': 3220,
  'R-404A': 3922,
  'R-407A': 2107,
  'R-407C': 1774,
  'R-407F': 1825,
  'R-410A': 2088,
  'R-417A': 2346,
  'R-422A': 3143,
  'R-422D': 2729,
  'R-427A': 2138,
  'R-434A': 3245,
  'R-437A': 1805,
  'R-438A': 2265,
  'R-442A': 1888,
  'R-448A': 1387,
  'R-449A': 1397,
  'R-450A': 605,
  'R-452A': 2140,
  'R-452B': 698,
  'R-454A': 239,
  'R-454B': 466,
  'R-454C': 148,
  'R-455A': 148,
  'R-507A': 3985,
  'R-508B': 13396,
  'R-513A': 631,
  'R-1234yf': 4,
  'R-1234ze': 7,
  'R-744': 1,
  'R-290': 3,
  'R-600a': 3,
  'R-1270': 2,
  'R-717': 0,
};

/** Liitteen II jakso 1 (fluoratut kaasut, joille kynnys on kiloina): puhtaat HFO:t. */
const ANNEX_II_SECTION_1 = new Set(['R-1234yf', 'R-1234ze', 'R-1233zd', 'R-1336mzz']);

export function normalizeRefrigerant(value: string | null | undefined): string {
  const s = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  const body = s.replace(/^R-?/, '');
  const key = Object.keys(FGAS_GWP).find((k) => k.toUpperCase().replace(/^R-?/, '') === body);
  return key ?? `R-${body}`;
}

export function refrigerantGwp(refrigerant: string | null | undefined): number | null {
  const key = normalizeRefrigerant(refrigerant);
  return key in FGAS_GWP ? FGAS_GWP[key] : null;
}

export type LeakCheckInput = {
  refrigerant?: string | null;
  chargeKg?: number | null;
  gwpOverride?: number | null;
};

export type LeakCheckResult = {
  gwp: number | null;
  co2eTonnes: number | null;
  /** null = ei velvoitetta / ei laskettavissa. */
  intervalMonths: number | null;
  reason: 'ok' | 'puuttuu' | 'alle-kynnyksen';
};

/** Art. 5(1): vuototarkastuksen väli kuukausina pelkästään CO₂e:stä (5/50/500 t → 12/6/3 kk). Vuodonilmaisin- ja hermeettisyysliput eivät vaikuta. */
export function leakCheckInterval(input: LeakCheckInput): LeakCheckResult {
  const kg = input.chargeKg != null && Number.isFinite(input.chargeKg) ? Number(input.chargeKg) : null;
  const ref = normalizeRefrigerant(input.refrigerant);
  const gwp = input.gwpOverride != null && input.gwpOverride >= 0 ? input.gwpOverride : refrigerantGwp(ref);
  if (kg == null || kg <= 0 || gwp == null) return { gwp, co2eTonnes: null, intervalMonths: null, reason: 'puuttuu' };
  const co2eTonnes = (kg * gwp) / 1000;

  if (ANNEX_II_SECTION_1.has(ref)) {
    if (kg < 1) return { gwp, co2eTonnes, intervalMonths: null, reason: 'alle-kynnyksen' };
    const base = kg < 10 ? 12 : kg < 100 ? 6 : 3;
    return { gwp, co2eTonnes, intervalMonths: base, reason: 'ok' };
  }
  if (co2eTonnes < 5) return { gwp, co2eTonnes, intervalMonths: null, reason: 'alle-kynnyksen' };
  const base = co2eTonnes < 50 ? 12 : co2eTonnes < 500 ? 6 : 3;
  return { gwp, co2eTonnes, intervalMonths: base, reason: 'ok' };
}

/** Oletushuoltoväli laitetyypin mukaan (kk), muokattavissa laitekohtaisesti. */
export function defaultServiceIntervalMonths(deviceType: string | null | undefined): number {
  switch (String(deviceType ?? '')) {
    case 'kylmäkoneikko':
    case 'pakastin':
      return 6;
    default:
      return 12;
  }
}

/** Laitekohtaiset huoltoasetukset (equipment.huolto_technical_snapshot.huoltoAsetukset). */
export type HuoltoAsetukset = {
  huoltovaliKk?: number | null;
  gwp?: number | null;
};

export const HUOLTO_ASETUKSET_KEY = 'huoltoAsetukset';

export function readHuoltoAsetukset(snapshot: unknown): HuoltoAsetukset {
  const raw = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>)[HUOLTO_ASETUKSET_KEY] : null;
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    huoltovaliKk: num(r.huoltovaliKk),
    gwp: num(r.gwp),
  };
}

/** Säilytä huoltoasetukset kun raportti kirjoittaa uuden teknisen tilannekuvan. */
export function carryHuoltoAsetukset(next: Record<string, unknown>, previous: unknown): Record<string, unknown> {
  const prev = previous && typeof previous === 'object' ? (previous as Record<string, unknown>)[HUOLTO_ASETUKSET_KEY] : undefined;
  return prev && typeof prev === 'object' ? { ...next, [HUOLTO_ASETUKSET_KEY]: prev } : next;
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / 86_400_000);
}

export type DueState = 'huollettu' | 'ok' | 'erääntyy' | 'myöhässä' | 'ei-tietoa';

export const DUE_SOON_DAYS = 30;
export const RECENT_DAYS = 30;

export function dueState(lastYmd: string | null, intervalMonths: number, todayYmd: string): { state: DueState; dueYmd: string | null } {
  if (!lastYmd) return { state: 'ei-tietoa', dueYmd: null };
  const dueYmd = addMonthsYmd(lastYmd, intervalMonths);
  if (daysBetween(lastYmd, todayYmd) <= RECENT_DAYS && lastYmd <= todayYmd) return { state: 'huollettu', dueYmd };
  const left = daysBetween(todayYmd, dueYmd);
  if (left < 0) return { state: 'myöhässä', dueYmd };
  if (left <= DUE_SOON_DAYS) return { state: 'erääntyy', dueYmd };
  return { state: 'ok', dueYmd };
}

/** 'tänään' / 'X pv sitten' (<14 pv) / 'X vk sitten' (<8 vk) / 'X kk sitten'. */
export function agoLabelFi(lastYmd: string, todayYmd: string): string {
  const days = Math.max(0, daysBetween(lastYmd, todayYmd));
  if (days === 0) return 'tänään';
  if (days < 14) return `${days} pv sitten`;
  if (days < 56) return `${Math.round(days / 7)} vk sitten`;
  return `${Math.max(2, Math.round(days / 30.44))} kk sitten`;
}

/** 'tänään' / 'X pv päästä' / 'X vk päästä' / 'X kk päästä'. */
export function untilLabelFi(dueYmd: string, todayYmd: string): string {
  const days = Math.max(0, daysBetween(todayYmd, dueYmd));
  if (days === 0) return 'tänään';
  if (days < 14) return `${days} pv päästä`;
  if (days < 56) return `${Math.round(days / 7)} vk päästä`;
  return `${Math.max(2, Math.round(days / 30.44))} kk päästä`;
}

/** Vuototarkastuksen tilateksti; null = ei näytetä (ajan tasalla tai ei vaadita). */
export function leakStatusText(leak: { state: DueState | null; dueYmd: string | null }, todayYmd: string): { label: string; tone: 'warn' | 'late' } | null {
  if (leak.state === 'myöhässä') return { label: 'Vuototarkastus myöhässä', tone: 'late' };
  if (leak.state === 'erääntyy') return { label: leak.dueYmd ? `Vuototarkastus erääntyy ${untilLabelFi(leak.dueYmd, todayYmd)}` : 'Vuototarkastus erääntyy', tone: 'warn' };
  if (leak.state === 'ei-tietoa') return { label: 'Ei vuototarkastusta', tone: 'warn' };
  return null;
}

/** Huollon tilateksti: myöhässä / erääntyy / Huollettu X sitten / ei huoltoa. */
export function serviceStatusText(service: { state: DueState; lastYmd: string | null; dueYmd?: string | null }, todayYmd: string): { label: string; tone: 'ok' | 'warn' | 'late' } {
  if (service.state === 'myöhässä') return { label: 'Huolto myöhässä', tone: 'late' };
  if (service.state === 'erääntyy') return { label: `Huolto erääntyy${service.dueYmd ? ` ${untilLabelFi(service.dueYmd, todayYmd)}` : ''}`, tone: 'warn' };
  if (service.state === 'ei-tietoa' || !service.lastYmd) return { label: 'Ei huoltoa', tone: 'warn' };
  const ago = agoLabelFi(service.lastYmd, todayYmd);
  return { label: ago === 'tänään' ? 'Huollettu tänään' : `Huollettu ${ago}`, tone: 'ok' };
}

export type DeviceSchedule = {
  serviceIntervalMonths: number;
  service: { state: DueState; dueYmd: string | null; lastYmd: string | null };
  leak: LeakCheckResult & { state: DueState | null; dueYmd: string | null; lastYmd: string | null };
  /** Huolto ja vuototarkastus kannattaa tehdä samalla käynnillä. */
  combineHint: boolean;
  /** Lajitteluavain: aikaisin eräpäivä (tyhjä = ei tietoa → ensin). */
  sortKey: string;
  needsService: boolean;
};

export function buildDeviceSchedule(input: {
  deviceType?: string | null;
  refrigerant?: string | null;
  chargeKg?: number | null;
  asetukset?: HuoltoAsetukset;
  lastServiceYmd?: string | null;
  lastLeakCheckYmd?: string | null;
  todayYmd: string;
}): DeviceSchedule {
  const a = input.asetukset ?? {};
  const serviceIntervalMonths = a.huoltovaliKk && a.huoltovaliKk > 0 ? a.huoltovaliKk : defaultServiceIntervalMonths(input.deviceType);
  const lastService = input.lastServiceYmd?.slice(0, 10) || null;
  const service = { ...dueState(lastService, serviceIntervalMonths, input.todayYmd), lastYmd: lastService };
  const leakBase = leakCheckInterval({
    refrigerant: input.refrigerant,
    chargeKg: input.chargeKg,
    gwpOverride: a.gwp ?? null,
  });
  const lastLeak = input.lastLeakCheckYmd?.slice(0, 10) || null;
  const leakDue = leakBase.intervalMonths ? dueState(lastLeak, leakBase.intervalMonths, input.todayYmd) : null;
  const leak = { ...leakBase, state: leakDue?.state ?? null, dueYmd: leakDue?.dueYmd ?? null, lastYmd: lastLeak };
  const dueish = (s: DueState | null) => s === 'erääntyy' || s === 'myöhässä' || s === 'ei-tietoa';
  const needsService = dueish(service.state) || dueish(leak.state);
  const dates = [service.dueYmd, leak.dueYmd].filter(Boolean) as string[];
  const sortKey = service.state === 'ei-tietoa' || leak.state === 'ei-tietoa' ? '' : dates.sort()[0] ?? '9999';
  const combineHint =
    Boolean(leak.intervalMonths) &&
    (dueish(service.state) || dueish(leak.state)) &&
    (leak.dueYmd == null || service.dueYmd == null || Math.abs(daysBetween(service.dueYmd, leak.dueYmd)) <= 90);
  return { serviceIntervalMonths, service, leak, combineHint, sortKey, needsService };
}

export function formatTonnes(t: number | null): string {
  if (t == null) return '—';
  return `${t.toLocaleString('fi-FI', { maximumFractionDigits: 2, minimumFractionDigits: t < 10 ? 2 : 1 })} t`;
}

export function todayYmdLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
