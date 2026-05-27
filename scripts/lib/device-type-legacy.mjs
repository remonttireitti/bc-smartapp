/** Pidä synkassa src/lib/huoltoRaportti/deviceTypeLegacy.ts kanssa */

export const DEVICE_TYPE_ALIASES = {
  'Vedenjäähdytyskone': 'vedenjäähdytyskone',
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

const DEVICE_VALUES = new Set([
  'vedenjäähdytyskone',
  'pakastin',
  'vakioilmastointtikone',
  'lämpöpumppu',
  'kylmäkoneikko',
  'konvektorit',
  'mlp',
  'vesiilmalampopumppu',
  'muu',
]);

const DEVICE_LABELS = {
  vedenjäähdytyskone: 'Vedenjäähdytyskone',
  pakastin: 'Pakastin',
  vakioilmastointtikone: 'Vakioilmastointtikone',
  lämpöpumppu: 'Ilmalämpöpumppu',
  kylmäkoneikko: 'Kylmäkoneikko',
  konvektorit: 'Konvektorit',
  mlp: 'Maalämpöpumppu',
  vesiilmalampopumppu: 'Vesi-ilmalämpöpumppu',
  muu: 'Muu laite',
};

function normalizeDeviceKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function hasAnyString(...values) {
  return values.some((v) => String(v ?? '').trim().length > 0);
}

export function canonicalizeDeviceType(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  if (DEVICE_TYPE_ALIASES[trimmed]) return DEVICE_TYPE_ALIASES[trimmed];
  if (DEVICE_VALUES.has(trimmed)) return trimmed;

  const norm = normalizeDeviceKey(trimmed);
  for (const [alias, value] of Object.entries(DEVICE_TYPE_ALIASES)) {
    if (normalizeDeviceKey(alias) === norm) return value;
  }
  for (const value of DEVICE_VALUES) {
    if (normalizeDeviceKey(value) === norm) return value;
  }
  for (const label of Object.values(DEVICE_LABELS)) {
    if (normalizeDeviceKey(label) === norm) {
      return Object.entries(DEVICE_LABELS).find(([, l]) => l === label)?.[0] ?? '';
    }
  }
  return trimmed;
}

function hasNestepiiriValues(p) {
  if (!p) return false;
  return hasAnyString(p.virtaus, p.meno, p.tulo);
}

function hasMlpKeruupiiriValues(m) {
  if (!m) return false;
  return hasAnyString(m.keruupiiriVirtaus, m.keruupiiriMeno, m.keruupiiriTulo, m.keruupiiriNeste, m.keruupiiriPaineBar);
}

function hasMlpPiiritValues(m) {
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

function isLikelyGroundSourceMlp(m) {
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

export function inferDeviceTypeFromLegacyData(data) {
  if ((data.konvektoriRows?.length ?? 0) > 0) return 'konvektorit';

  const mlp = data.mlpData;
  const modules = data.selectedModules ?? {};
  const hasNestelauhduttimet = (data.nestelauhduttimetVj?.length ?? 0) > 0;
  const hasJaahdytysvesi = hasNestepiiriValues(data.jaahdytysvesiData);
  const mlpPiiritModule = Boolean(modules.mlpPiirit);
  const legacyMlpModules = Boolean(
    modules.keruupiiri || modules.latauspiiri || modules.kayttovesi || modules.lammityspiiri || modules.energiat,
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

export function resolveLegacyDeviceType(data, meta = {}) {
  const source = { ...meta, ...data };
  let resolved = canonicalizeDeviceType(source.laiteTyyppi ?? data.laiteTyyppi ?? '');

  if (!resolved && source.equipmentSnapshot?.deviceType) {
    resolved = canonicalizeDeviceType(source.equipmentSnapshot.deviceType);
  }
  if (!resolved && source.laite?.tyyppi) {
    resolved = canonicalizeDeviceType(source.laite.tyyppi);
  }
  if (source.isMLP === true && (!resolved || resolved === 'muu')) {
    resolved = 'mlp';
  }
  if (!resolved || resolved === 'muu') {
    const inferred = inferDeviceTypeFromLegacyData(data);
    if (inferred) resolved = inferred;
  }
  if (resolved && !DEVICE_VALUES.has(resolved)) {
    const retry = canonicalizeDeviceType(resolved);
    resolved = DEVICE_VALUES.has(retry) ? retry : '';
  }
  return resolved;
}
