import type { ModuleKey } from './constants';
import type { HuoltoReportData, JaahdytysvesiData, MlpData, RefrigerantCircuitData, TyhjiointiData } from './types';

/** Vanhan Firestore-sovelluksen laitetyypit → nykyiset arvot. */
const DEVICE_TYPE_ALIASES: Record<string, string> = {
  Vedenjäähdytyskone: 'vedenjäähdytyskone',
  MLP: 'mlp',
  Lämpöpumppu: 'lämpöpumppu',
};

/** Vanhat moduuliavaimet → nykyiset ModuleKey-arvot. */
const LEGACY_MODULE_TO_NEW: Record<string, ModuleKey> = {
  kylmapiri: 'kylmaainePiiri',
  kylmaaine: 'kylmaainePiiri',
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

type LegacyRecord = Partial<HuoltoReportData> & Record<string, unknown>;

function isChillerDeviceType(deviceType: string): boolean {
  return deviceType === 'vedenjäähdytyskone' || deviceType === 'vakioilmastointtikone';
}

function hasNestepiiriValues(p: Partial<JaahdytysvesiData> | undefined): boolean {
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

function hasMlpKeruupiiriValues(m: Partial<MlpData> | null | undefined): boolean {
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

/** Vanha VJK tallensi jäähdytyspiirin usein mlpData.keruupiiri*-kenttiin. */
export function mapLegacyMlpKeruupiiriToJaahdytysvesi(
  mlp: Partial<MlpData> | null | undefined,
  existing: Partial<JaahdytysvesiData> | undefined,
): Partial<JaahdytysvesiData> | undefined {
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

function mapLegacyTyhjiointiData(raw: unknown): Partial<TyhjiointiData> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const ty = raw as Record<string, unknown>;
  const patch: Partial<TyhjiointiData> = {};
  if (!String(ty.kaytettyPainemittari ?? '').trim() && typeof ty.pumpunTyyppi === 'string') {
    patch.kaytettyPainemittari = ty.pumpunTyyppi.trim();
  }
  return Object.keys(patch).length ? patch : undefined;
}

/**
 * Kartoittaa vanhan huoltoraportin kentät nykyiseen data-malliin.
 * Firestore tallensi mm. kp1Data/kp2Data/kp3Data — uusi app odottaa kylmaainePiiri1/2/3.
 */
export function applyLegacyHuoltoFields(
  raw: LegacyRecord,
  meta?: Record<string, unknown>,
): LegacyRecord {
  const source: Record<string, unknown> = { ...meta, ...raw };
  const out: LegacyRecord = { ...raw };

  const laiteTyyppi = String(source.laiteTyyppi ?? out.laiteTyyppi ?? '').trim();
  if (laiteTyyppi && DEVICE_TYPE_ALIASES[laiteTyyppi]) {
    out.laiteTyyppi = DEVICE_TYPE_ALIASES[laiteTyyppi];
  } else if (!out.laiteTyyppi && source.isMLP === true) {
    out.laiteTyyppi = 'mlp';
  } else if (out.laiteTyyppi === 'muu' && source.isMLP === true) {
    out.laiteTyyppi = 'mlp';
  }

  if (source.kp1Data && typeof source.kp1Data === 'object') {
    out.kylmaainePiiri1 = source.kp1Data as RefrigerantCircuitData;
  }
  if (source.kp2Data && typeof source.kp2Data === 'object') {
    out.kylmaainePiiri2 = source.kp2Data as RefrigerantCircuitData;
  }
  if (source.kp3Data && typeof source.kp3Data === 'object') {
    out.kylmaainePiiri3 = source.kp3Data as RefrigerantCircuitData;
  }

  if (!String(out.asiakas ?? '').trim() && typeof source.customerName === 'string') {
    out.asiakas = source.customerName.trim();
  }

  if (
    (!Array.isArray(out.konvektoriRows) || out.konvektoriRows.length === 0) &&
    Array.isArray(source.konvektoritData)
  ) {
    out.konvektoriRows = source.konvektoritData as HuoltoReportData['konvektoriRows'];
  }

  const legacyModules = source.selectedModules;
  if (legacyModules && typeof legacyModules === 'object' && !Array.isArray(legacyModules)) {
    const mapped: Record<string, boolean> = {
      ...(out.selectedModules as Record<string, boolean> | undefined),
    };
    for (const [key, val] of Object.entries(legacyModules as Record<string, boolean>)) {
      if (!val) continue;
      const mappedKey = LEGACY_MODULE_TO_NEW[key] ?? key;
      mapped[mappedKey] = true;
      if (key.startsWith('mlp_') || LEGACY_MODULE_TO_NEW[key] === 'mlpPiirit') {
        mapped.mlpPiirit = true;
      }
    }
    out.selectedModules = mapped as HuoltoReportData['selectedModules'];
  }

  if (source.isMLP === true) {
    out.selectedModules = {
      ...(out.selectedModules ?? {}),
      mlpPiirit: true,
    } as HuoltoReportData['selectedModules'];
  }

  if (source.laite && typeof source.laite === 'object') {
    const laite = source.laite as Record<string, unknown>;
    if (!out.laiteMalli && laite.malli) out.laiteMalli = String(laite.malli);
    if (!out.laiteValmistaja && laite.valmistaja) out.laiteValmistaja = String(laite.valmistaja);
    if (!out.laiteTunnus && laite.tunnus) out.laiteTunnus = String(laite.tunnus);
    if (!out.laiteTyyppi && laite.tyyppi) {
      const t = String(laite.tyyppi);
      out.laiteTyyppi = DEVICE_TYPE_ALIASES[t] ?? t;
    }
  }

  if (source.companyInfo && !out.legacyCompanyInfo) {
    out.legacyCompanyInfo = source.companyInfo;
  }

  const resolvedDeviceType = String(out.laiteTyyppi ?? '').trim();
  if (isChillerDeviceType(resolvedDeviceType) && source.mlpData && typeof source.mlpData === 'object') {
    const mlp = source.mlpData as Partial<MlpData>;
    if (!out.mlpData) out.mlpData = mlp as MlpData;
    out.jaahdytysvesiData = mapLegacyMlpKeruupiiriToJaahdytysvesi(
      mlp,
      out.jaahdytysvesiData as Partial<JaahdytysvesiData> | undefined,
    ) as JaahdytysvesiData | undefined;
  }

  const tyPatch = mapLegacyTyhjiointiData(source.tyhjiointiData);
  if (tyPatch) {
    (out as { tyhjiointiData?: Partial<TyhjiointiData> }).tyhjiointiData = {
      ...(out.tyhjiointiData as Partial<TyhjiointiData> | undefined),
      ...tyPatch,
    };
  }

  return out;
}

export function huoltoTitleFromFirestore(doc: Record<string, unknown>): string {
  const title = String(doc.title ?? '').trim();
  if (title) return title.slice(0, 200);
  const customer = String(doc.customerName ?? doc.asiakas ?? '').trim();
  const device = String(doc.laiteTunnus ?? doc.laiteMalli ?? '').trim();
  if (customer && device) return `${customer} – ${device}`.slice(0, 200);
  return customer || device || 'Huoltoraportti';
}
