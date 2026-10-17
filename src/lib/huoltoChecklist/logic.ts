import { huoltoCategoryLabel, type ChecklistCategoryKey } from '../huoltoCategories';
import {
  CIRCUIT_LIMITS,
  checklistTemplate,
  type ChecklistMeasurement,
  type ChecklistStatus,
  type ChecklistTemplate,
} from './templates';

export type ChecklistPhoto = { storagePath: string; comment: string };

export type ChecklistItemState = {
  /** null/undefined = Ei kuulu (ei tarkastettu). */
  status?: ChecklistStatus | null;
  comment?: string;
  photos?: ChecklistPhoto[];
};

export type ChecklistCircuitRow = {
  id: string;
  keskus: string;
  ryhma: string;
  suoja: string;
  riso: string;
  zs: string;
  rcdMs: string;
};

/** maintenance_reports.data tarkastuslistaraportille (LVI / IV / Sähkö). */
export type ChecklistReportData = {
  reportCategory: ChecklistCategoryKey;
  schemaVersion: 1;
  customerId?: string;
  /** Listan ja haun yhteiset kentät (samat nimet kuin kylmäraportilla). */
  asiakas: string;
  osoite: string;
  laiteTyyppi: string;
  laiteTunnus: string;
  laiteMalli: string;
  laiteValmistaja: string;
  laiteSijainti: string;
  /** Kohde / järjestelmä vapaana tekstinä (esim. "IV-kone TK01, vesikatto"). */
  kohde: string;
  tarkastusPvm: string;
  items: Record<string, ChecklistItemState>;
  measurements: Record<string, string>;
  circuits: ChecklistCircuitRow[];
  toimenpiteet: string;
  seuraavaHuolto: string;
  suorittajaNimi: string;
  suorittajaPatevyys: string;
  mittalaitteet: string;
  /** Piirretty allekirjoitus (PNG data-URL). */
  signature?: string;
  signedAt?: string;
  huoltoWorkReportId?: string;
  /** Esimerkkitieto (onboarding). */
  onboardingDemo?: boolean;
};

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createEmptyChecklistReport(category: ChecklistCategoryKey, now = new Date()): ChecklistReportData {
  return {
    reportCategory: category,
    schemaVersion: 1,
    asiakas: '',
    osoite: '',
    laiteTyyppi: '',
    laiteTunnus: '',
    laiteMalli: '',
    laiteValmistaja: '',
    laiteSijainti: '',
    kohde: '',
    tarkastusPvm: todayYmd(now),
    items: {},
    measurements: {},
    circuits: [],
    toimenpiteet: '',
    seuraavaHuolto: '',
    suorittajaNimi: '',
    suorittajaPatevyys: '',
    mittalaitteet: '',
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function isStatus(v: unknown): v is ChecklistStatus {
  return v === 'ok' || v === 'huom' || v === 'vika';
}

export function normalizeChecklistReport(raw: unknown, category: ChecklistCategoryKey): ChecklistReportData {
  const base = createEmptyChecklistReport(category);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const items: Record<string, ChecklistItemState> = {};
  if (r.items && typeof r.items === 'object') {
    for (const [id, value] of Object.entries(r.items as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      items[id] = {
        status: isStatus(v.status) ? v.status : null,
        comment: str(v.comment),
        photos: Array.isArray(v.photos)
          ? (v.photos as unknown[])
              .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
              .map((p) => ({ storagePath: str(p.storagePath), comment: str(p.comment) }))
              .filter((p) => p.storagePath)
          : [],
      };
    }
  }
  const measurements: Record<string, string> = {};
  if (r.measurements && typeof r.measurements === 'object') {
    for (const [id, value] of Object.entries(r.measurements as Record<string, unknown>)) measurements[id] = str(value);
  }
  const circuits = Array.isArray(r.circuits)
    ? (r.circuits as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c, i) => ({
          id: str(c.id) || `c${i + 1}`,
          keskus: str(c.keskus),
          ryhma: str(c.ryhma),
          suoja: str(c.suoja),
          riso: str(c.riso),
          zs: str(c.zs),
          rcdMs: str(c.rcdMs),
        }))
    : [];
  return {
    ...base,
    customerId: str(r.customerId) || undefined,
    ...(r.onboardingDemo === true ? { onboardingDemo: true } : {}),
    asiakas: str(r.asiakas),
    osoite: str(r.osoite),
    laiteTunnus: str(r.laiteTunnus),
    laiteMalli: str(r.laiteMalli),
    laiteValmistaja: str(r.laiteValmistaja),
    laiteSijainti: str(r.laiteSijainti),
    kohde: str(r.kohde),
    tarkastusPvm: str(r.tarkastusPvm) || base.tarkastusPvm,
    items,
    measurements,
    circuits,
    toimenpiteet: str(r.toimenpiteet),
    seuraavaHuolto: str(r.seuraavaHuolto),
    suorittajaNimi: str(r.suorittajaNimi),
    suorittajaPatevyys: str(r.suorittajaPatevyys),
    mittalaitteet: str(r.mittalaitteet),
    signature: str(r.signature) || undefined,
    signedAt: str(r.signedAt) || undefined,
    huoltoWorkReportId: str(r.huoltoWorkReportId) || undefined,
  };
}

/** "12,5" → 12.5; tyhjä/virheellinen → null. */
export function parseMeasurement(value: string | undefined | null): number | null {
  const s = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Raja-arvon ylitys: palauttaa vakavuuden tai null. */
export function measurementViolation(m: ChecklistMeasurement, value: string | undefined): ChecklistStatus | null {
  if (m.text) return null;
  const n = parseMeasurement(value);
  if (n == null) return null;
  if (m.min != null && n < m.min) return m.severity ?? 'huom';
  if (m.max != null && n > m.max) return m.severity ?? 'huom';
  return null;
}

export function formatFiNumber(n: number, decimals = 0): string {
  return n.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/\u00a0/g, ' ');
}

/** Raja-arvon kuvaus: "≥ 55 °C", "≤ 300 ms", "50–65 °C". */
export function measurementLimitText(m: ChecklistMeasurement): string {
  const unit = m.unit ? ` ${m.unit}` : '';
  if (m.min != null && m.max != null) return `${formatFiNumber(m.min)}–${formatFiNumber(m.max)}${unit}`;
  if (m.min != null) return `≥ ${formatFiNumber(m.min)}${unit}`;
  if (m.max != null) return `≤ ${formatFiNumber(m.max)}${unit}`;
  return '';
}

export type CircuitViolation = { rowId: string; field: 'riso' | 'rcdMs'; severity: ChecklistStatus };

export function circuitViolations(rows: ChecklistCircuitRow[]): CircuitViolation[] {
  const out: CircuitViolation[] = [];
  for (const row of rows) {
    const riso = parseMeasurement(row.riso);
    if (riso != null && riso < CIRCUIT_LIMITS.risoMinMohm) out.push({ rowId: row.id, field: 'riso', severity: 'vika' });
    const rcd = parseMeasurement(row.rcdMs);
    if (rcd != null && rcd > CIRCUIT_LIMITS.rcdMaxMs) out.push({ rowId: row.id, field: 'rcdMs', severity: 'vika' });
  }
  return out;
}

export type ChecklistFinding = {
  sectionTitle: string;
  itemId: string;
  label: string;
  status: Exclude<ChecklistStatus, 'ok'>;
  comment: string;
  /** Raja-arvon ylitys ilman käyttäjän merkintää. */
  fromMeasurement: boolean;
};

/** Huomautukset ja viat (merkityt + raja-arvojen ylitykset) tulosteen ja yhteenvedon listaan. */
export function checklistFindings(data: ChecklistReportData, template = checklistTemplate(data.reportCategory)): ChecklistFinding[] {
  const out: ChecklistFinding[] = [];
  for (const section of template.sections) {
    for (const item of section.items) {
      const state = data.items[item.id];
      const violations = (item.measurements ?? [])
        .map((m) => ({ m, sev: measurementViolation(m, data.measurements[m.id]) }))
        .filter((v): v is { m: ChecklistMeasurement; sev: ChecklistStatus } => v.sev != null);
      const userStatus = state?.status;
      const userFlag = userStatus === 'huom' || userStatus === 'vika' ? userStatus : null;
      if (!userFlag && violations.length === 0) continue;
      const measuredSev = violations.length === 0 ? null : violations.some((v) => v.sev === 'vika') ? 'vika' : 'huom';
      // Vakavampi voittaa: käyttäjän merkintä tai raja-arvon ylitys.
      const sev: 'huom' | 'vika' = userFlag === 'vika' || measuredSev === 'vika' ? 'vika' : 'huom';
      const text = violations
        .map((v) => `${v.m.label} ${data.measurements[v.m.id]?.trim()} ${v.m.unit}`.trim() + ` (raja ${measurementLimitText(v.m)})`)
        .join(', ');
      out.push({
        sectionTitle: section.title,
        itemId: item.id,
        label: item.label,
        status: sev,
        comment: [state?.comment?.trim(), text].filter(Boolean).join(' · '),
        fromMeasurement: !userFlag,
      });
    }
  }
  if (template.circuitTable) {
    for (const v of circuitViolations(data.circuits)) {
      const row = data.circuits.find((r) => r.id === v.rowId);
      if (!row) continue;
      const where = [row.keskus, row.ryhma].map((s) => s.trim()).filter(Boolean).join(' / ') || 'Ryhmä';
      const text = v.field === 'riso'
        ? `Eristysresistanssi ${row.riso.trim()} MΩ (raja ≥ ${CIRCUIT_LIMITS.risoMinMohm} MΩ)`
        : `Vikavirtasuojan laukaisu ${row.rcdMs.trim()} ms (raja ≤ ${CIRCUIT_LIMITS.rcdMaxMs} ms)`;
      out.push({ sectionTitle: 'Mittaukset ryhmittäin', itemId: `circuit:${row.id}:${v.field}`, label: where, status: v.severity as 'vika', comment: text, fromMeasurement: true });
    }
  }
  return out;
}

export type ChecklistOverall = 'vika' | 'huom' | 'ok' | 'empty';

export type ChecklistSummary = {
  overall: ChecklistOverall;
  ok: number;
  huom: number;
  vika: number;
  /** Ei kuulu / ei merkitty. */
  na: number;
  total: number;
};

/** Kokonaistulos: vika > huomautus > kunnossa; ilman yhtään merkintää "empty". */
export function checklistSummary(data: ChecklistReportData, template = checklistTemplate(data.reportCategory)): ChecklistSummary {
  const findings = checklistFindings(data, template);
  const findingById = new Map<string, ChecklistFinding>();
  for (const f of findings) findingById.set(f.itemId, f);
  let ok = 0;
  let huom = 0;
  let vika = 0;
  let na = 0;
  let total = 0;
  for (const section of template.sections) {
    for (const item of section.items) {
      total += 1;
      const f = findingById.get(item.id);
      const status = f ? f.status : data.items[item.id]?.status;
      if (status === 'vika') vika += 1;
      else if (status === 'huom') huom += 1;
      else if (status === 'ok') ok += 1;
      else na += 1;
    }
  }
  const circuitFaults = findings.filter((f) => f.itemId.startsWith('circuit:')).length;
  const anyVika = vika > 0 || circuitFaults > 0;
  const overall: ChecklistOverall = anyVika ? 'vika' : huom > 0 ? 'huom' : ok > 0 ? 'ok' : 'empty';
  return { overall, ok, huom, vika, na, total };
}

export const CHECKLIST_OVERALL_LABELS: Record<ChecklistOverall, string> = {
  vika: 'Vikoja havaittu',
  huom: 'Huomautuksia',
  ok: 'Kunnossa',
  empty: 'Ei merkintöjä',
};

/** LTO:n lämpötilasuhde tuloilmasta (%), kun poisto- ja ulkoilman ero on vähintään 5 K. */
export function ltoEfficiencyPercent(measurements: Record<string, string>): number | null {
  const ulko = parseMeasurement(measurements.lto_ulko_c);
  const tulo = parseMeasurement(measurements.lto_tulo_c);
  const poisto = parseMeasurement(measurements.lto_poisto_c);
  if (ulko == null || tulo == null || poisto == null) return null;
  const denom = poisto - ulko;
  if (denom < 5) return null;
  return Math.round(((tulo - ulko) / denom) * 100);
}

/** Ilmavirran poikkeama suunnitellusta (%), etumerkillinen. */
export function airflowDeviationPercent(measured: string | undefined, design: string | undefined): number | null {
  const m = parseMeasurement(measured);
  const d = parseMeasurement(design);
  if (m == null || d == null || d <= 0) return null;
  return Math.round(((m - d) / d) * 100);
}

/** Lasketut lisärivit kohteen alle (IV). */
export function derivedItemValues(itemId: string, measurements: Record<string, string>): string[] {
  if (itemId === 'lto') {
    const eta = ltoEfficiencyPercent(measurements);
    return eta == null ? [] : [`Lämpötilasuhde ${eta} %`];
  }
  if (itemId === 'ilmamaara_tulo') {
    const dev = airflowDeviationPercent(measurements.tulo_ls, measurements.tulo_suunn_ls);
    return dev == null ? [] : [`Poikkeama suunnitellusta ${dev > 0 ? '+' : ''}${dev} %`];
  }
  if (itemId === 'ilmamaara_poisto') {
    const dev = airflowDeviationPercent(measurements.poisto_ls, measurements.poisto_suunn_ls);
    return dev == null ? [] : [`Poikkeama suunnitellusta ${dev > 0 ? '+' : ''}${dev} %`];
  }
  return [];
}

export function checklistDeviceLabel(data: Pick<ChecklistReportData, 'laiteTunnus' | 'laiteMalli' | 'laiteValmistaja' | 'kohde'>): string {
  return (
    data.kohde.trim()
    || data.laiteTunnus.trim()
    || [data.laiteValmistaja, data.laiteMalli].map((s) => s.trim()).filter(Boolean).join(' ')
  );
}

/** Raportin otsikko: "Asiakas – LVI-huolto TK01". */
export function buildChecklistReportTitle(customerName: string | null | undefined, data: ChecklistReportData): string {
  const base = customerName?.trim() || data.asiakas.trim() || 'Huoltoraportti';
  const device = checklistDeviceLabel(data);
  const snippet = [huoltoCategoryLabel(data.reportCategory), device].filter(Boolean).join(' ');
  return `${base} – ${snippet}`;
}

export function formatFiDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  if (!m) return ymd ?? '';
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

export function checklistPhotoCount(data: ChecklistReportData): number {
  return Object.values(data.items).reduce((n, s) => n + (s.photos?.length ?? 0), 0);
}

export type { ChecklistTemplate };
