import type { ModuleKey } from './constants';
import { canonicalizeDeviceType, resolveLegacyDeviceType } from './deviceTypeLegacy';
import { usesManualModuleMenu } from './deviceModuleLogic';
import type {
  CondenserData,
  HuoltoReportData,
  JaahdytysvesiData,
  LauhdutuspiiriData,
  MlpData,
  NestelauhdutinUnitData,
  RefrigerantCircuitData,
  TyhjiointiData,
} from './types';

/** Vanhat moduuliavaimet → nykyiset ModuleKey-arvot. */
const LEGACY_MODULE_TO_NEW: Record<string, ModuleKey> = {
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
  mlp_keruupiiri: 'mlpPiirit',
  mlp_latauspiiri: 'mlpPiirit',
  mlp_lampopiirit: 'mlpPiirit',
  mlp_kayttovesi: 'mlpPiirit',
  keruupiiri: 'mlpPiirit',
  latauspiiri: 'mlpPiirit',
  kayttovesi: 'mlpPiirit',
  lammityspiiri: 'mlpPiirit',
  energiat: 'mlpPiirit',
  tiiveyskoe: 'tiiveyskoe',
  tyhjiointi: 'tyhjiointi',
};

type LegacyRecord = Partial<HuoltoReportData> & Record<string, unknown>;

function isChillerDeviceType(deviceType: string): boolean {
  return deviceType === 'vedenjäähdytyskone' || deviceType === 'vakioilmastointtikone';
}

function hasNestepiiriValues(p: Partial<NestepiiriLike> | undefined): boolean {
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

type NestepiiriLike = {
  virtaus?: string;
  meno?: string;
  tulo?: string;
  neste?: string;
  paineBar?: string;
  pumppuTarkastettu?: boolean;
  paineTarkastettu?: boolean;
  pumppuValmistaja?: string;
  pumppuMalli?: string;
  paisuntaAstiaTarkistettu?: boolean;
  paisuntaAstiaKoko?: string;
  paisuntaAstiaEsipaine?: string;
  automaattinenIlmausTarkistettu?: boolean;
  mutapussiPuhdistettu?: boolean;
  toimilaitteetOK?: boolean;
  painesäätimenTarkistettu?: boolean;
  painesäätimenMalli?: string;
  virtausRiittävä?: boolean;
  virtausOngelma?: string;
};

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

function mapLegacyCondenserToLauhdutuspiiri(
  condensers: CondenserData[] | undefined,
  existing: Partial<LauhdutuspiiriData> | undefined,
): Partial<LauhdutuspiiriData> | undefined {
  if (hasNestepiiriValues(existing)) return existing;
  const liquid = condensers?.find((c) => c.tyyppi === 'nestekiertoinen');
  if (!liquid) return existing;
  const src = liquid as CondenserData & NestepiiriLike;
  if (!hasNestepiiriValues(src)) return existing;
  return {
    ...existing,
    neste: existing?.neste || src.neste || '',
    virtaus: existing?.virtaus || src.virtaus || '',
    meno: existing?.meno || src.meno || '',
    tulo: existing?.tulo || src.tulo || '',
    paineTarkastettu: existing?.paineTarkastettu ?? src.paineTarkastettu ?? src.painesäätimenTarkistettu ?? false,
    paineBar: existing?.paineBar || src.paineBar || '',
    pumppuTarkastettu: existing?.pumppuTarkastettu ?? src.pumppuTarkastettu ?? false,
    pumppuValmistaja: existing?.pumppuValmistaja || src.pumppuValmistaja || '',
    pumppuMalli: existing?.pumppuMalli || src.pumppuMalli || '',
    painesäätimenTarkistettu: existing?.painesäätimenTarkistettu ?? src.painesäätimenTarkistettu ?? false,
    painesäätimenMalli: existing?.painesäätimenMalli || src.painesäätimenMalli || '',
    virtausRiittävä: existing?.virtausRiittävä ?? src.virtausRiittävä ?? true,
    virtausOngelma: existing?.virtausOngelma || src.virtausOngelma || '',
  };
}

function migrateNestelauhduttimetVj(units: NestelauhdutinUnitData[] | undefined): NestelauhdutinUnitData[] {
  if (!Array.isArray(units)) return [];
  return units.map((unit) => {
    const u = unit as NestelauhdutinUnitData & NestepiiriLike;
    const nested = u.lauhdutuspiiri ?? ({} as LauhdutuspiiriData);
    if (hasNestepiiriValues(nested)) return unit;
    const flatHas = hasNestepiiriValues(u);
    if (!flatHas) return unit;
    return {
      ...unit,
      lauhdutuspiiri: {
        ...nested,
        neste: nested.neste || u.neste || '',
        virtaus: nested.virtaus || u.virtaus || '',
        meno: nested.meno || u.meno || '',
        tulo: nested.tulo || u.tulo || '',
        paineTarkastettu: nested.paineTarkastettu ?? u.paineTarkastettu ?? false,
        paineBar: nested.paineBar || u.paineBar || '',
        pumppuTarkastettu: nested.pumppuTarkastettu ?? u.pumppuTarkastettu ?? false,
        pumppuValmistaja: nested.pumppuValmistaja || u.pumppuValmistaja || '',
        pumppuMalli: nested.pumppuMalli || u.pumppuMalli || '',
        painesäätimenTarkistettu: nested.painesäätimenTarkistettu ?? u.painesäätimenTarkistettu ?? false,
        painesäätimenMalli: nested.painesäätimenMalli || u.painesäätimenMalli || '',
        virtausRiittävä: nested.virtausRiittävä ?? u.virtausRiittävä ?? true,
        virtausOngelma: nested.virtausOngelma || u.virtausOngelma || '',
        paisuntaAstiaTarkistettu: nested.paisuntaAstiaTarkistettu ?? u.paisuntaAstiaTarkistettu ?? false,
        paisuntaAstiaKoko: nested.paisuntaAstiaKoko || u.paisuntaAstiaKoko || '',
        paisuntaAstiaEsipaine: nested.paisuntaAstiaEsipaine || u.paisuntaAstiaEsipaine || '',
        automaattinenIlmausTarkistettu:
          nested.automaattinenIlmausTarkistettu ?? u.automaattinenIlmausTarkistettu ?? false,
        mutapussiPuhdistettu: nested.mutapussiPuhdistettu ?? u.mutapussiPuhdistettu ?? false,
        toimilaitteetOK: nested.toimilaitteetOK ?? u.toimilaitteetOK ?? false,
      },
    };
  });
}

function mapLegacyTyhjiointiData(raw: unknown): Partial<TyhjiointiData> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const ty = raw as Record<string, unknown>;
  const patch: Partial<TyhjiointiData> = {};
  if (!String(ty.kaytettyPainemittari ?? '').trim() && typeof ty.pumpunTyyppi === 'string') {
    patch.kaytettyPainemittari = ty.pumpunTyyppi.trim();
  }
  if (!String(ty.loppupaineArvo ?? '').trim() && ty.loppupaineMikronia != null) {
    patch.loppupaineArvo = String(ty.loppupaineMikronia).trim();
    if (!ty.loppupaineYksikko) patch.loppupaineYksikko = 'micron';
  }
  return Object.keys(patch).length ? patch : undefined;
}

function hasAnyString(...values: unknown[]): boolean {
  return values.some((v) => String(v ?? '').trim().length > 0);
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

/** Päättelee moduulit vanhan raportin datasta — täydentää tuontia. */
export function inferModulesFromLegacyData(data: Partial<HuoltoReportData>): Partial<Record<ModuleKey, boolean>> {
  const inferred: Partial<Record<ModuleKey, boolean>> = {};

  if (data.kylmaainePiiri1 || data.kylmaainePiiri2 || data.kylmaainePiiri3) {
    inferred.kylmaainePiiri = true;
  }
  if (data.evaporatorData?.some((ev) => hasAnyString(ev.valmistaja, ev.malli, ev.sarjanumero))) {
    if (data.laiteTyyppi !== 'vedenjäähdytyskone') {
      inferred.hoyrystin = true;
    }
  }
  if (data.condenserData?.some((c) => hasAnyString(c.tyyppi, c.lauhdutinPuhdistusTapa, c.painesäätimenMalli))) {
    inferred.lauhdutin = true;
  }
  if (hasMlpPiiritValues(data.mlpData)) inferred.mlpPiirit = true;
  if (hasNestepiiriValues(data.jaahdytysvesiData)) inferred.vedenjajahdytyskone = true;
  if (Array.isArray(data.nestelauhduttimetVj) && data.nestelauhduttimetVj.length > 0) {
    inferred.nestelauhduttimet = true;
  }
  if (hasNestepiiriValues(data.lauhdutuspiiriData)) inferred.lauhdutin = true;
  if (data.vapaajahdytysKaytossa) inferred.vapaajahdytys = true;
  if (data.konvektoriRows?.length) inferred.konvektorit = true;
  if (
    hasAnyString(
      data.ulkoyksikkoMalli,
      data.ulkoyksikkoSarjanumero,
      data.ulkoyksikkoJaahdytysTeho,
      data.ulkoyksikkoLammitysTeho,
    )
  ) {
    inferred.ulkoyksikko = true;
  }
  if (data.sisayksikkoData?.some((s) => hasAnyString(s.malli, s.sarjanumero, s.tyyppi))) {
    inferred.sisayksikko = true;
  }
  if (
    data.mittausSisayksikot?.some((m) =>
      hasAnyString(m.imupaineJaahdytys, m.korkeapaineJaahdytys, m.sisalampotila, m.ilmanmaaraM3h),
    ) ||
    hasAnyString(data.mittausAmpeeriL1, data.mittausAmpeeriL2, data.mittausAmpeeriL3)
  ) {
    inferred.mittaukset = true;
  }
  if (data.tiiveyskoeData && Object.values(data.tiiveyskoeData).some((v) => v === true || hasAnyString(v))) {
    inferred.tiiveyskoe = true;
  }
  if (data.tyhjiointiData && Object.values(data.tyhjiointiData).some((v) => v === true || hasAnyString(v))) {
    inferred.tyhjiointi = true;
  }

  return inferred;
}

export function mergeLegacySelectedModules(
  deviceType: string,
  legacyModules: Partial<Record<ModuleKey, boolean>> | undefined,
  inferred: Partial<Record<ModuleKey, boolean>>,
): Partial<Record<ModuleKey, boolean>> {
  const merged: Partial<Record<ModuleKey, boolean>> = {
    ...inferred,
    ...(legacyModules ?? {}),
  };

  if (usesManualModuleMenu(deviceType)) {
    return merged;
  }

  return {
    ...merged,
    tiiveyskoe: legacyModules?.tiiveyskoe ?? inferred.tiiveyskoe ?? false,
    tyhjiointi: legacyModules?.tyhjiointi ?? inferred.tyhjiointi ?? false,
  };
}

/**
 * Kartoittaa vanhan huoltoraportin kentät nykyiseen data-malliin.
 */
export function applyLegacyHuoltoFields(
  raw: LegacyRecord,
  meta?: Record<string, unknown>,
): LegacyRecord {
  const source: Record<string, unknown> = { ...meta, ...raw };
  const out: LegacyRecord = { ...raw };

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

  if (Array.isArray(out.nestelauhduttimetVj) && out.nestelauhduttimetVj.length > 0) {
    out.nestelauhduttimetVj = migrateNestelauhduttimetVj(out.nestelauhduttimetVj);
    out.selectedModules = {
      ...(out.selectedModules ?? {}),
      nestelauhduttimet: true,
    } as HuoltoReportData['selectedModules'];
  }

  if (source.laite && typeof source.laite === 'object') {
    const laite = source.laite as Record<string, unknown>;
    if (!out.laiteMalli && laite.malli) out.laiteMalli = String(laite.malli);
    if (!out.laiteValmistaja && laite.valmistaja) out.laiteValmistaja = String(laite.valmistaja);
    if (!out.laiteTunnus && laite.tunnus) out.laiteTunnus = String(laite.tunnus);
    if (!out.laiteTyyppi && laite.tyyppi) {
      out.laiteTyyppi = canonicalizeDeviceType(String(laite.tyyppi));
    }
  }

  if (source.companyInfo && !out.legacyCompanyInfo) {
    out.legacyCompanyInfo = source.companyInfo as Record<string, unknown>;
  }

  if (typeof source.piilotaVaroitukset === 'boolean') {
    out.piilotaVaroitukset = source.piilotaVaroitukset;
  }

  const tyPatch = mapLegacyTyhjiointiData(source.tyhjiointiData);
  if (tyPatch) {
    (out as { tyhjiointiData?: Partial<TyhjiointiData> }).tyhjiointiData = {
      ...(out.tyhjiointiData as Partial<TyhjiointiData> | undefined),
      ...tyPatch,
    };
  }

  const resolvedType = resolveLegacyDeviceType(out as HuoltoReportData, source);
  if (resolvedType) {
    out.laiteTyyppi = resolvedType;
  }

  const resolvedDeviceType = String(out.laiteTyyppi ?? '').trim();
  if (isChillerDeviceType(resolvedDeviceType)) {
    if (source.mlpData && typeof source.mlpData === 'object') {
      const mlp = source.mlpData as Partial<MlpData>;
      if (!out.mlpData) out.mlpData = mlp as MlpData;
      out.jaahdytysvesiData = mapLegacyMlpKeruupiiriToJaahdytysvesi(
        mlp,
        out.jaahdytysvesiData as Partial<JaahdytysvesiData> | undefined,
      ) as JaahdytysvesiData | undefined;
    }
    if (hasMlpPiiritValues(out.mlpData as Partial<MlpData> | null | undefined)) {
      out.selectedModules = {
        ...(out.selectedModules ?? {}),
        mlpPiirit: true,
      } as HuoltoReportData['selectedModules'];
    }
    const condensers = (out.condenserData ?? source.condenserData) as CondenserData[] | undefined;
    out.lauhdutuspiiriData = mapLegacyCondenserToLauhdutuspiiri(
      condensers,
      out.lauhdutuspiiriData as Partial<LauhdutuspiiriData> | undefined,
    ) as LauhdutuspiiriData | undefined;
    if (!out.lauhdutinTyyppiLaite) out.lauhdutinTyyppiLaite = 'nestekiertoinen';
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
