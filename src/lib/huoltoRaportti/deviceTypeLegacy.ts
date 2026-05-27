import { deviceTypes, type DeviceTypeValue, type ModuleKey } from './constants';
import type { HuoltoReportData, MlpData } from './types';

/** Vanhan Firestore-sovelluksen laitetyypit → nykyiset arvot. */
export const DEVICE_TYPE_ALIASES: Record<string, DeviceTypeValue> = {
  Vedenjäähdytyskone: 'vedenjäähdytyskone',
  Vakioilmastointtikone: 'vakioilmastointtikone',
  Pakastin: 'pakastin',
  Kylmäkoneikko: 'kylmäkoneikko',
  Konvektorit: 'konvektorit',
  MLP: 'mlp',
  Lämpöpumppu: 'lämpöpumppu',
  'Vesi-ilmalämpöpumppu': 'vesiilmalampopumppu',
  VesiIlmalampopumppu: 'vesiilmalampopumppu',
  Maalämpöpumppu: 'mlp',
  'Maalämpöpumppu (MLP)': 'mlp',
  Ilmalämpöpumppu: 'lämpöpumppu',
  lämpöpumppu: 'lämpöpumppu',
};

const DEVICE_VALUES = new Set(deviceTypes.map((d) => d.value));

function normalizeDeviceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function isKnownDeviceType(value: string): value is DeviceTypeValue {
  return DEVICE_VALUES.has(value as DeviceTypeValue);
}

/** Kartoittaa vanhan / kirjoitusvirheellisen merkkijonon nykyiseen deviceTypes-arvoon. */
export function canonicalizeDeviceType(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  const direct = DEVICE_TYPE_ALIASES[trimmed];
  if (direct) return direct;
  if (isKnownDeviceType(trimmed)) return trimmed;

  const norm = normalizeDeviceKey(trimmed);
  for (const [alias, value] of Object.entries(DEVICE_TYPE_ALIASES)) {
    if (normalizeDeviceKey(alias) === norm) return value;
  }
  for (const dt of deviceTypes) {
    if (normalizeDeviceKey(dt.value) === norm || normalizeDeviceKey(dt.label) === norm) {
      return dt.value;
    }
  }

  return trimmed;
}

function hasAnyString(...values: unknown[]): boolean {
  return values.some((v) => String(v ?? '').trim().length > 0);
}

function hasNestepiiriValues(p: { virtaus?: string; meno?: string; tulo?: string } | null | undefined): boolean {
  if (!p) return false;
  return hasAnyString(p.virtaus, p.meno, p.tulo);
}

function hasMlpKeruupiiriValues(m: Partial<MlpData> | null | undefined): boolean {
  if (!m) return false;
  return hasAnyString(
    m.keruupiiriVirtaus,
    m.keruupiiriMeno,
    m.keruupiiriTulo,
    m.keruupiiriNeste,
    m.keruupiiriPaineBar,
  );
}

function hasMlpPiiritValues(m: Partial<MlpData> | null | undefined): boolean {
  if (!m) return false;
  return Boolean(
    hasMlpKeruupiiriValues(m) ||
      m.latausVirtaus ||
      m.latausMeno ||
      m.kayttovesiEnabled ||
      (m.lampoPiirit?.length ?? 0) > 0 ||
      parseInt(String(m.lampoPiireja ?? ''), 10) > 0 ||
      m.mittaaKokoLaiteSahko ||
      m.kylmaainePaineLauhdutinBar,
  );
}

/** Maalämpö vs VJK: VJK voi tallentaa jäähdytyspiirin vain mlpData.keruupiiri-kenttiin. */
function isLikelyGroundSourceMlp(m: Partial<MlpData> | null | undefined): boolean {
  if (!m) return false;
  return Boolean(
    m.kayttovesiEnabled ||
      hasAnyString(m.kayttovesiTilavuus, m.latausVirtaus, m.latausMeno, m.kylmaainePaineLauhdutinBar) ||
      (m.lampoPiirit?.length ?? 0) > 0 ||
      parseInt(String(m.lampoPiireja ?? ''), 10) > 0 ||
      m.mittaaKokoLaiteSahko ||
      m.keruuJaahdytysPiiri ||
      m.latausTulistuspiiri,
  );
}

function readEquipmentDeviceType(source: Record<string, unknown>): string {
  const snap = source.equipmentSnapshot;
  if (snap && typeof snap === 'object' && 'deviceType' in snap) {
    return canonicalizeDeviceType(String((snap as { deviceType?: unknown }).deviceType ?? ''));
  }
  const laite = source.laite;
  if (laite && typeof laite === 'object' && 'tyyppi' in laite) {
    return canonicalizeDeviceType(String((laite as { tyyppi?: unknown }).tyyppi ?? ''));
  }
  return '';
}

/** Päättelee laitetyypin tallennetusta legacy-datasta kun kenttä puuttuu tai on "muu". */
export function inferDeviceTypeFromLegacyData(
  data: Partial<HuoltoReportData>,
): DeviceTypeValue | '' {
  if ((data.konvektoriRows?.length ?? 0) > 0) return 'konvektorit';

  const mlp = data.mlpData;
  const modules: Partial<Record<ModuleKey, boolean>> & Record<string, boolean> = {
    ...(data.selectedModules ?? {}),
  };
  const hasNestelauhduttimet = (data.nestelauhduttimetVj?.length ?? 0) > 0;
  const hasJaahdytysvesi = hasNestepiiriValues(data.jaahdytysvesiData);
  const mlpPiiritModule = Boolean(modules.mlpPiirit);
  const legacyMlpModules = Boolean(
    modules.keruupiiri ||
      modules.latauspiiri ||
      modules.kayttovesi ||
      modules.lammityspiiri ||
      modules.energiat,
  );

  const kp = data.kylmaainePiiri1;
  const hasRefrigerantCircuit = hasAnyString(kp?.imupaine, kp?.korkeapaine, kp?.imuLampotila);

  if (
    hasNestelauhduttimet ||
    (modules.vedenjajahdytyskone && hasJaahdytysvesi && !isLikelyGroundSourceMlp(mlp)) ||
    (hasJaahdytysvesi && !isLikelyGroundSourceMlp(mlp))
  ) {
    return 'vedenjäähdytyskone';
  }

  if (
    hasMlpKeruupiiriValues(mlp) &&
    !isLikelyGroundSourceMlp(mlp) &&
    (hasRefrigerantCircuit || hasNestelauhduttimet || modules.vedenjajahdytyskone)
  ) {
    return 'vedenjäähdytyskone';
  }

  if (
    isLikelyGroundSourceMlp(mlp) ||
    (hasMlpPiiritValues(mlp) && (mlpPiiritModule || legacyMlpModules || isLikelyGroundSourceMlp(mlp)))
  ) {
    if (
      hasAnyString(data.ulkoyksikkoMalli, data.ulkoyksikkoSarjanumero) &&
      (data.sisayksikkoData?.length ?? 0) > 0 &&
      !isLikelyGroundSourceMlp(mlp) &&
      !hasMlpKeruupiiriValues(mlp)
    ) {
      return 'vesiilmalampopumppu';
    }
    return 'mlp';
  }

  if (
    hasAnyString(data.ulkoyksikkoMalli, data.ulkoyksikkoSarjanumero) ||
    data.sisayksikkoData?.some((s) => hasAnyString(s.malli, s.sarjanumero, s.tyyppi)) ||
    modules.ulkoyksikko ||
    modules.sisayksikko
  ) {
    return 'lämpöpumppu';
  }

  if (modules.konvektorit) return 'konvektorit';
  if (modules.nestelauhduttimet) return 'vedenjäähdytyskone';

  return '';
}

/**
 * Kanonisoi ja täydentää laitetyypin tuonnissa / normalisoinnissa.
 * Palauttaa tyhjän jos tyyppiä ei voi luotettavasti päätellä.
 */
export function resolveLegacyDeviceType(
  data: Partial<HuoltoReportData>,
  meta?: Record<string, unknown>,
): string {
  const source: Record<string, unknown> = { ...meta, ...data };
  let resolved = canonicalizeDeviceType(String(source.laiteTyyppi ?? data.laiteTyyppi ?? ''));

  if (!resolved) {
    resolved = readEquipmentDeviceType(source);
  }

  if (source.isMLP === true) {
    if (!resolved || resolved === 'muu') resolved = 'mlp';
  }

  if (!resolved || resolved === 'muu') {
    const inferred = inferDeviceTypeFromLegacyData(data);
    if (inferred) resolved = inferred;
  }

  if (resolved && !isKnownDeviceType(resolved)) {
    const retry = canonicalizeDeviceType(resolved);
    resolved = isKnownDeviceType(retry) ? retry : '';
  }

  return resolved;
}
