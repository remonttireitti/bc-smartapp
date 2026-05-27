/**
 * Maps legacy Firestore huolto_raportit documents to current maintenance_reports.data shape.
 */

const DEVICE_TYPE_ALIASES = {
  'Vedenjäähdytyskone': 'vedenjäähdytyskone',
  Vakioilmastointtikone: 'vakioilmastointtikone',
  Pakastin: 'pakastin',
  Kylmäkoneikko: 'kylmäkoneikko',
  Konvektorit: 'konvektorit',
  MLP: 'mlp',
  Lämpöpumppu: 'lämpöpumppu',
  'Vesi-ilmalämpöpumppu': 'vesiilmalampopumppu',
  VesiIlmalampopumppu: 'vesiilmalampopumppu',
};

const LEGACY_MODULE_TO_NEW = {
  kylmapiri: 'kylmaainePiiri',
  kylmaaine: 'kylmaainePiiri',
  hoyrystin: 'hoyrystin',
  lauhdutin: 'lauhdutin',
  ulkoyksikko: 'ulkoyksikko',
  sisayksikko: 'sisayksikko',
  mittaukset: 'mittaukset',
  vedenjajahdytyskone: 'vedenjajahdytyskone',
  nestelauhduttimet: 'nestelauhduttimet',
  konvektorit: 'konvektorit',
  vapaajahdytys: 'vapaajahdytys',
  tiiveyskoe: 'tiiveyskoe',
  tyhjiointi: 'tyhjiointi',
  mlp_keruupiiri: 'mlpPiirit',
  mlp_latauspiiri: 'mlpPiirit',
  mlp_lampopiirit: 'mlpPiirit',
  mlp_kayttovesi: 'mlpPiirit',
  keruupiiri: 'mlpPiirit',
  latauspiiri: 'mlpPiirit',
  kayttovesi: 'mlpPiirit',
  lammityspiiri: 'mlpPiirit',
  energiat: 'mlpPiirit',
};

function isChillerDeviceType(deviceType) {
  return deviceType === 'vedenjäähdytyskone' || deviceType === 'vakioilmastointtikone';
}

function hasNestepiiriValues(p) {
  if (!p) return false;
  return Boolean(
    p.virtaus ||
      p.meno ||
      p.tulo ||
      p.neste ||
      p.paineBar ||
      p.pumppuTarkastettu ||
      p.paineTarkastettu,
  );
}

function hasMlpKeruupiiriValues(m) {
  if (!m) return false;
  return Boolean(
    m.keruupiiriVirtaus ||
      m.keruupiiriMeno ||
      m.keruupiiriTulo ||
      m.keruupiiriNeste ||
      m.keruupiiriPaineBar ||
      m.keruupiirinPaineTarkastettu ||
      m.keruupiirinPumppuTarkastettu,
  );
}

export function mapLegacyMlpKeruupiiriToJaahdytysvesi(mlp, existing) {
  if (!mlp || !hasMlpKeruupiiriValues(mlp)) return existing;
  if (hasNestepiiriValues(existing)) return existing;

  const virtausLs = parseFloat(String(mlp.keruupiiriVirtaus ?? '')) || 0;
  const virtausM3h =
    virtausLs > 0 ? String(virtausLs * 3.6) : String(mlp.keruupiiriVirtaus ?? '');

  return {
    ...existing,
    neste: existing?.neste || mlp.keruupiiriNeste || '',
    virtaus: existing?.virtaus || virtausM3h,
    meno: existing?.meno || mlp.keruupiiriMeno || '',
    tulo: existing?.tulo || mlp.keruupiiriTulo || '',
    paineBar: existing?.paineBar || mlp.keruupiiriPaineBar || '',
    paineTarkastettu: existing?.paineTarkastettu ?? mlp.keruupiirinPaineTarkastettu ?? false,
    pumppuTarkastettu: existing?.pumppuTarkastettu ?? mlp.keruupiirinPumppuTarkastettu ?? false,
    pumppuValmistaja: existing?.pumppuValmistaja || mlp.keruupiiriPumpunValmistaja || '',
    pumppuMalli: existing?.pumppuMalli || mlp.keruupiiriPumpunMalli || '',
    paisuntaAstiaTarkistettu:
      existing?.paisuntaAstiaTarkistettu ?? mlp.keruuPaisuntaAstiaTarkistettu ?? false,
    paisuntaAstiaKoko: existing?.paisuntaAstiaKoko || mlp.keruuPaisuntaAstiaKoko || '',
    paisuntaAstiaEsipaine: existing?.paisuntaAstiaEsipaine || mlp.keruuPaisuntaAstiaEsipaine || '',
    automaattinenIlmausTarkistettu:
      existing?.automaattinenIlmausTarkistettu ?? mlp.keruupiirissaAutomaattinenIlmausTarkistettu ?? false,
    mutapussiPuhdistettu:
      existing?.mutapussiPuhdistettu ?? mlp.keruupiirissaMutapussiPuhdistettu ?? false,
    toimilaitteetOK: existing?.toimilaitteetOK ?? mlp.keruupiirinEristeetKunnossa ?? false,
  };
}

function mapLegacyTyhjiointiData(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const patch = {};
  if (!String(raw.kaytettyPainemittari ?? '').trim() && typeof raw.pumpunTyyppi === 'string') {
    patch.kaytettyPainemittari = raw.pumpunTyyppi.trim();
  }
  if (!String(raw.loppupaineArvo ?? '').trim() && raw.loppupaineMikronia != null) {
    patch.loppupaineArvo = String(raw.loppupaineMikronia).trim();
    if (!raw.loppupaineYksikko) patch.loppupaineYksikko = 'micron';
  }
  return Object.keys(patch).length ? patch : undefined;
}

export function applyLegacyHuoltoFields(raw, meta = {}) {
  const source = { ...meta, ...raw };
  const out = { ...raw };

  const laiteTyyppi = String(source.laiteTyyppi ?? out.laiteTyyppi ?? '').trim();
  if (laiteTyyppi && DEVICE_TYPE_ALIASES[laiteTyyppi]) {
    out.laiteTyyppi = DEVICE_TYPE_ALIASES[laiteTyyppi];
  } else if (!out.laiteTyyppi && source.isMLP === true) {
    out.laiteTyyppi = 'mlp';
  } else if (out.laiteTyyppi === 'muu' && source.isMLP === true) {
    out.laiteTyyppi = 'mlp';
  }

  if (source.kp1Data && typeof source.kp1Data === 'object') out.kylmaainePiiri1 = source.kp1Data;
  if (source.kp2Data && typeof source.kp2Data === 'object') out.kylmaainePiiri2 = source.kp2Data;
  if (source.kp3Data && typeof source.kp3Data === 'object') out.kylmaainePiiri3 = source.kp3Data;

  if (!String(out.asiakas ?? '').trim() && typeof source.customerName === 'string') {
    out.asiakas = source.customerName.trim();
  }

  if (
    (!Array.isArray(out.konvektoriRows) || out.konvektoriRows.length === 0) &&
    Array.isArray(source.konvektoritData)
  ) {
    out.konvektoriRows = source.konvektoritData;
  }

  if (source.selectedModules && typeof source.selectedModules === 'object') {
    const mapped = { ...(out.selectedModules ?? {}) };
    for (const [key, val] of Object.entries(source.selectedModules)) {
      if (!val) continue;
      const mappedKey = LEGACY_MODULE_TO_NEW[key] ?? key;
      mapped[mappedKey] = true;
      if (key.startsWith('mlp_') || LEGACY_MODULE_TO_NEW[key] === 'mlpPiirit') {
        mapped.mlpPiirit = true;
      }
    }
    out.selectedModules = mapped;
  }

  if (source.isMLP === true) {
    out.selectedModules = { ...(out.selectedModules ?? {}), mlpPiirit: true };
  }

  if (source.laite && typeof source.laite === 'object') {
    if (!out.laiteMalli && source.laite.malli) out.laiteMalli = String(source.laite.malli);
    if (!out.laiteValmistaja && source.laite.valmistaja) out.laiteValmistaja = String(source.laite.valmistaja);
    if (!out.laiteTunnus && source.laite.tunnus) out.laiteTunnus = String(source.laite.tunnus);
    if (!out.laiteTyyppi && source.laite.tyyppi) {
      const t = String(source.laite.tyyppi);
      out.laiteTyyppi = DEVICE_TYPE_ALIASES[t] ?? t;
    }
  }

  if (source.companyInfo && !out.legacyCompanyInfo) {
    out.legacyCompanyInfo = source.companyInfo;
  }

  const resolvedDeviceType = String(out.laiteTyyppi ?? '').trim();
  if (isChillerDeviceType(resolvedDeviceType) && source.mlpData && typeof source.mlpData === 'object') {
    if (!out.mlpData) out.mlpData = source.mlpData;
    out.jaahdytysvesiData = mapLegacyMlpKeruupiiriToJaahdytysvesi(source.mlpData, out.jaahdytysvesiData);
    out.selectedModules = { ...(out.selectedModules ?? {}), mlpPiirit: true };
  }

  const tyPatch = mapLegacyTyhjiointiData(source.tyhjiointiData);
  if (tyPatch) {
    out.tyhjiointiData = { ...(out.tyhjiointiData ?? {}), ...tyPatch };
  }

  return out;
}

export function huoltoTitleFromFirestore(doc) {
  const title = String(doc.title ?? '').trim();
  if (title) return title.slice(0, 200);
  const customer = String(doc.customerName ?? doc.asiakas ?? '').trim();
  const device = String(doc.laiteTunnus ?? doc.laiteMalli ?? '').trim();
  if (customer && device) return `${customer} – ${device}`.slice(0, 200);
  return customer || device || 'Huoltoraportti';
}

