import { carryHuoltoAsetukset } from '../huoltoSchedule';
import { ilpDeviceModel, ilpDeviceSerial, isIlpDevice, realIdentityValue } from './ilpIdentity';
import {
  deviceFieldsFromSnapshot,
  effectiveDeviceFields,
  fillEmptyEquipmentDeviceFields,
  loadEquipmentDeviceFields,
} from '../equipmentDeviceFields';
import { refrigerantFieldsFromReport, snapshotWithRefrigerant } from '../equipmentRefrigerant';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createEmptySisayksikkoData,
  ensureCondenserData,
  ensureEvaporatorData,
  ensureMlpData,
  ensureRefrigerantCircuitData,
  ensureSisayksikkoData,
  mergeHuoltoReportData,
} from './defaults';
import {
  getCompressorVaiheValinta,
  getCondenserFanVaiheValinta,
  getKokoLaiteSahkoVaiheValinta,
  getMlpPumpSyottoValinta,
} from './sahkoVaiheUtils';
import { createEmptyHuoltoReportData, ensureKonvektoriRow, konvektoriRowsHaveMaintenanceData } from './defaults';
import type {
  HeatingElementData,
  CompressorData,
  CondenserData,
  CondenserFanData,
  EquipmentSnapshot,
  EvaporatorData,
  HeatingCircuitData,
  HuoltoReportData,
  KonvektoriRowData,
  MlpData,
  NestelauhdutinUnitData,
  PumpunSyottoValinta,
  RefrigerantCircuitData,
  SisayksikkoData,
} from './types';
import { getRefrigerantGWP, resolveKylmaaineTyyppi } from './utils';

const trim = (s: unknown) => String(s ?? '').trim();

function konvektoriRowHasIdentity(row: KonvektoriRowData): boolean {
  return Boolean(row.tunnus.trim() || row.valmistaja.trim() || row.malli.trim() || row.sarjanumero.trim());
}

function konvektoriRowsHaveRegistryData(rows: KonvektoriRowData[] | undefined): boolean {
  return (rows ?? []).some(konvektoriRowHasIdentity);
}

function field(data: HuoltoReportData, key: string): unknown {
  return data[key];
}

function strField(data: HuoltoReportData, key: string): string {
  return trim(field(data, key));
}

export function stripCompressorForRegistry(k: CompressorData): Partial<CompressorData> {
  const vv = getCompressorVaiheValinta(k);
  const out: Partial<CompressorData> = {
    ohjaustapa: k.ohjaustapa,
    kontaktoriTyyppi: k.kontaktoriTyyppi,
    pehmokaynnistinTyyppi: k.pehmokaynnistinTyyppi,
    taajuusmuuttajaTyyppi: k.taajuusmuuttajaTyyppi,
    ohjaustapaMuu: k.ohjaustapaMuu,
  };
  if (trim(k.valmistaja)) out.valmistaja = trim(k.valmistaja);
  if (trim(k.malli)) out.malli = trim(k.malli);
  if (!out.malli && !out.valmistaja && trim(k.tyyppi)) out.tyyppi = trim(k.tyyppi);
  if (vv === '1' || vv === '3') out.kompressorinVaiheValinta = vv;
  return out;
}

export function stripRefrigerantCircuitForRegistry(c: RefrigerantCircuitData): Record<string, unknown> {
  const rest = { ...(c as unknown as Record<string, unknown>) };
  delete rest.imupaine;
  delete rest.imuLampotila;
  delete rest.korkeapaine;
  delete rest.nestePutkiLampotila;
  delete rest.kuumakaasuLampotila;
  delete rest.tulistus;
  delete rest.alijäähtyminen;
  delete rest.magneettiventtiiliTestattu;
  delete rest.nestelasiKuiva;
  delete rest.kuivainOK;
  delete rest.kuivainLisatieto;
  // Käyntikohtaiset tulokset/toimenpiteet (koneikon komponentit).
  delete rest.nestelasiKuplat;
  delete rest.nestelasiKosteus;
  delete rest.kuivainVaihdettu;
  delete rest.imusuodatinVaihdettu;
  if (Array.isArray(rest.kompponentit)) {
    rest.kompponentit = (rest.kompponentit as Record<string, unknown>[]).map((k) => ({ ...k, tila: null, kommentti: '' }));
  }
  return {
    ...rest,
    kompressori1: stripCompressorForRegistry(c.kompressori1),
    kompressori2: stripCompressorForRegistry(c.kompressori2),
    kompressori3: stripCompressorForRegistry(c.kompressori3),
    kompressori4: stripCompressorForRegistry(c.kompressori4),
    kompressori5: stripCompressorForRegistry(c.kompressori5),
    kompressori6: stripCompressorForRegistry(c.kompressori6),
  };
}

function huoltoFormShowsEvaporatorSection(
  laiteTyyppi: string,
  selectedModules?: { hoyrystin?: boolean },
): boolean {
  if (laiteTyyppi === 'kylmäkoneikko' || laiteTyyppi === 'pakastin') return true;
  if (laiteTyyppi === 'muu') return Boolean(selectedModules?.hoyrystin);
  return false;
}

/** Höyrystimen kiinteät tiedot (#231/#232): venttiilit, ohjaus, kennon mitat. Mittaukset ja tulokset jäävät raportille. */
const EVAPORATOR_FIXED_BOOL = ['magneettiventtiiliKaytossa', 'paisuntaventtiiliKaytossa', 'ohjausKaytossa'] as const;
const EVAPORATOR_FIXED_TEXT = [
  'magneettiventtiiliMalli', 'paisuntaventtiiliTyyppi', 'paisuntaventtiiliMalli', 'ohjausTyyppi', 'ohjausMalli', 'ovikytkin',
  'kennoPituusMm', 'kennoKorkeusMm', 'kennoSyvyysMm', 'ripavaliMm', 'putkirivit',
] as const;

/** Ohjaukset-vaiheen kiinteät kentät (laitekortille). */
/** Laitetason kiinteät kokoonpanokentät (lauhdutustapa, LMV, höyrystimet, sulatus, VJK-jakotiedot). */
export const DEVICE_CONFIG_FIELDS = [
  'lauhdutinTyyppiLaite', 'lauhdutinLmvTyyppi', 'hoyrystinTyyppi', 'hoyrystimienMaara', 'hoyrystimetPiireittain', 'sulatusKaytossa', 'sulatusTapa',
  'vjNestelauhdutusJaettu', 'hoyrystinYhteinenPiireissa', 'vapaajahdytysKaytossa',
] as const;

/** Vedenjäähdytyskone / VAK: nestepiirien kiinteät kentät laitekorttiin. */
export const VJ_FIXED_FIELDS = {
  vapaajahdytysData: ['neste', 'pumppuValmistaja', 'pumppuMalli', 'ohjaus'],
  jaahdytysvesiData: ['neste', 'pumppuValmistaja', 'pumppuMalli', 'paisuntaAstiaKoko'],
  lauhdutuspiiriData: ['neste', 'pumppuValmistaja', 'pumppuMalli', 'paisuntaAstiaKoko', 'painesäätimenMalli'],
  hoyrystinPiiriData: ['neste', 'pumppuValmistaja', 'pumppuMalli', 'paisuntaAstiaKoko'],
  vjOhjausData: ['ohjausValmistaja', 'lauhdutusOhjausLahde', 'asetusArvot'],
} as const;

export const OHJAUKSET_FIXED_FIELDS = ['koneikkoOhjaustapa', 'saadin', 'hoyrystinOhjaus', 'ohjausTyyppi'] as const;

export function stripEvaporatorForRegistry(e: EvaporatorData): Partial<EvaporatorData> {
  const hx = e.tyyppi === 'levy' || e.tyyppi === 'putki';
  const out: Partial<EvaporatorData> = {
    tyyppi: e.tyyppi,
  };
  if (trim(e.valmistaja)) out.valmistaja = trim(e.valmistaja);
  if (trim(e.malli)) out.malli = trim(e.malli);
  if (trim(e.sarjanumero)) out.sarjanumero = trim(e.sarjanumero);
  if (!hx) {
    out.sulatus = e.sulatus;
    out.sahkoJannite = e.sahkoJannite;
    out.sulatusOhjaus = e.sulatusOhjaus;
    out.sulatusOhjausMuu = e.sulatusOhjausMuu;
    out.sulatusKelloMalli = e.sulatusKelloMalli;
    out.sulatusSäädinMalli = e.sulatusSäädinMalli;
    out.puhaltimienMaara = e.puhaltimienMaara;
    out.puhaltimet = (e.puhaltimet || []).map((f) => {
      const vv = getCondenserFanVaiheValinta(f, f.jannite === '400' ? '400' : undefined);
      if (vv === '1' || vv === '3') {
        return {
          id: f.id,
          phase: vv === '3' ? 3 : 1,
          vaiheValinta: vv,
          jannite: f.jannite,
        } as CondenserFanData;
      }
      return { id: f.id, jannite: f.jannite } as CondenserFanData;
    });
    if (trim(e.huoneenTunnus)) out.huoneenTunnus = trim(e.huoneenTunnus);
  }
  for (const key of EVAPORATOR_FIXED_BOOL) {
    if (typeof e[key] === 'boolean') (out as Record<string, unknown>)[key] = e[key];
  }
  if (!trim(e.ohjausMalli) && trim(e.sulatusSäädinMalli)) out.ohjausMalli = trim(e.sulatusSäädinMalli);
  for (const key of EVAPORATOR_FIXED_TEXT) {
    const v = trim(e[key]);
    if (v) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

export function stripCondenserForRegistry(c: CondenserData): Partial<CondenserData> {
  const fans = (c.puhaltimet || []).map((f) => {
    const vv = getCondenserFanVaiheValinta(f, f.jannite === '400' ? '400' : undefined);
    if (vv === '1' || vv === '3') {
      const fan: CondenserFanData = {
        id: f.id,
        phase: vv === '3' ? 3 : 1,
        virtaL1: '',
        jannite: f.jannite,
        vaiheValinta: vv,
      };
      return fan;
    }
    return { id: f.id, phase: 1 as const, virtaL1: '', jannite: f.jannite };
  });
  const out: Partial<CondenserData> = { tyyppi: c.tyyppi, puhaltimet: fans };
  if (trim(c.valmistaja)) out.valmistaja = trim(c.valmistaja);
  if (trim(c.malli)) out.malli = trim(c.malli);
  if (trim(c.sarjanumero)) out.sarjanumero = trim(c.sarjanumero);
  const pm = c.puhaltimienMaara != null ? Number(c.puhaltimienMaara) : 0;
  if (pm > 0) out.puhaltimienMaara = c.puhaltimienMaara;
  if (c.puhallinOhjaus) out.puhallinOhjaus = c.puhallinOhjaus;
  if (trim(c.puhallinOhjausMuu)) out.puhallinOhjausMuu = trim(c.puhallinOhjausMuu);
  if (trim(c.nopeussäädinMalli)) out.nopeussäädinMalli = trim(c.nopeussäädinMalli);
  if (trim(c.taajusmuuntajaMalli)) out.taajusmuuntajaMalli = trim(c.taajusmuuntajaMalli);
  if (trim(c.kpPressostaattiMalli)) out.kpPressostaattiMalli = trim(c.kpPressostaattiMalli);
  if (c.talvivarustus === true) {
    out.talvivarustus = true;
    if (trim(c.talvivarustusTapa)) out.talvivarustusTapa = trim(c.talvivarustusTapa);
  }
  if (trim(c.painesäätimenMalli)) out.painesäätimenMalli = trim(c.painesäätimenMalli);
  return out;
}

function stripNestelauhdutinUnitForRegistry(u: Record<string, unknown>): Record<string, unknown> {
  const sy = u.puhallinSyotto === '400' ? '400' : '230';
  const maaraNum = u.puhaltimienMaara != null ? Number(u.puhaltimienMaara) : NaN;
  const fanSlots = Number.isFinite(maaraNum) ? Math.min(16, Math.max(0, maaraNum)) : 0;
  const rawFans = Array.isArray(u.puhaltimet) ? u.puhaltimet : [];
  const fans =
    fanSlots === 0
      ? []
      : rawFans.slice(0, fanSlots).map((f: CondenserFanData) => {
          const vv = getCondenserFanVaiheValinta(f, sy);
          const base: Record<string, unknown> = { id: f.id, phase: vv === '3' ? 3 : 1 };
          if (f.jannite) base.jannite = f.jannite;
          if (vv === '1' || vv === '3') base.vaiheValinta = vv;
          return base;
        });
  const out: Record<string, unknown> = { id: u.id, puhaltimet: fans };
  for (const key of [
    'valmistaja',
    'malli',
    'sarjanumero',
    'puhaltimienMaara',
    'puhallinSyotto',
    'puhaltimienValmistaja',
    'puhaltimienMalli',
    'puhallinOhjausTapa',
    'ohjausLahde',
  ] as const) {
    const v = u[key];
    if (v != null && trim(v)) out[key] = typeof v === 'number' ? v : trim(v);
  }
  return out;
}


/** MLP: laitekorttiin vain kiinteä kokoonpano (allowlist) — ei käyntikohtaisia tiloja, huomioita, esipaineita, mittauksia. */
const MLP_KEEP: (keyof MlpData)[] = [
  'keruupiirinPumpunTyyppi', 'keruupiiriPumpunValmistaja', 'keruupiiriPumpunMalli', 'keruupiiriPumpunSyottoValinta', 'keruupiiriNeste',
  'keruuPaisuntaAstiaKoko',
  'keruuJaahdytysPiiri', 'keruuJaahdytysPiiriPumppu', 'keruuJaahdytysPumppuTyyppi', 'keruuJaahdytysPumpunValmistaja', 'keruuJaahdytysPumpunMalli', 'keruuJaahdytysPumpunSyottoValinta',
  'latausPumpunTyyppi', 'latausPumpunValmistaja', 'latausPumpunMalli', 'latausPumpunSyottoValinta', 'latausNeste', 'latausPaisuntaAstiaKoko',
  'latausTulistuspiiri', 'latausTulistuspiiriPumppu', 'latausTulistusPumppuTyyppi', 'latausTulistusPumpunValmistaja', 'latausTulistusPumpunMalli', 'latausTulistusPumpunSyottoValinta', 'latausTulistusNeste',
  'latausJarjestelmanNeste',
  'keruuNestePitoisuus',
  'kayttovesiEnabled', 'kayttovesiTilavuus', 'kayttovesiLampotilaAsetus', 'kayttovesiVaraajaTyyppi', 'kayttovesiLisavastusTeho',
  'kayttovesiLegionellaKaytossa', 'kayttovesiLegionellaLampotila', 'kayttovesiLegionellaAjastus',
  'kayttovesiSahkoVastuksetEnabled', 'kayttovesiSahkoVastuksetSijainti', 'kayttovesiSahkoVastuksetMaara', 'kayttovesiSahkoVastukset',
  'kayttovesiKiertoEnabled', 'kayttovesiKiertoPumppuTyyppi', 'kayttovesiKiertoPumpunValmistaja', 'kayttovesiKiertoPumpunMalli',
  'kiinteistoPiiritSisallytetaan', 'lampoPiireja', 'lampoPiirit', 'lampoPaisuntaAstiaKoko',
  'lampoSahkoKattilaVaralampitykseen', 'lampoSahkoKattilaTeho', 'lampoSahkoKattilaTyyppi',
  'mittaaKokoLaiteSahko', 'kokoLaiteSahkoVaiheValinta',
];

export function stripMlpDataForRegistry(m: MlpData): Partial<MlpData> {
  const copy: Record<string, unknown> = {};
  for (const k of MLP_KEEP) if (m[k] !== undefined) copy[k as string] = m[k];
  if (Array.isArray(m.kayttovesiSahkoVastukset)) {
    copy.kayttovesiSahkoVastukset = m.kayttovesiSahkoVastukset.map((v) => {
      const rest = { ...v } as Partial<HeatingElementData>;
      delete rest.toimintaTestattu;
      return rest;
    });
  }
  if (m.kiinteistoPiiritSisallytetaan === false) {
    for (const k of [
      'lampoPiirit',
      'lampoPiireja',
      'lampoPaisuntaAstiaTarkistettu',
      'lampoPaisuntaAstiaKoko',
      'lampoPaisuntaAstiaEsipaine',
      'lampoToimilaitteetOK',
      'lampoAutomaattinenIlmausTarkistettu',
      'lampoMutapussiPuhdistettu',
      'lampoSahkoKattilaVaralampitykseen',
      'lampoSahkoKattilaTeho',
      'lampoSahkoKattilaTyyppi',
    ]) {
      delete copy[k];
    }
  } else if (Array.isArray(m.lampoPiirit)) {
    copy.lampoPiirit = m.lampoPiirit.map((row) => {
      const out: Partial<HeatingCircuitData> = {
        jakotapa: row.jakotapa,
        jakotapaMuu: row.jakotapaMuu,
      };
      if (trim(row.pumppuValmistaja)) out.pumppuValmistaja = trim(row.pumppuValmistaja);
      if (trim(row.pumppuMalli)) out.pumppuMalli = trim(row.pumppuMalli);
      if (trim(row.pumppuTyyppi)) out.pumppuTyyppi = trim(row.pumppuTyyppi);
      if (trim(row.neste)) out.neste = trim(row.neste);
      const sv = getMlpPumpSyottoValinta(row.pumppuSyottoValinta, row.pumppuKolmeVaihetta);
      if (sv === '230_1' || sv === '400_3') out.pumppuSyottoValinta = sv;
      return out as HeatingCircuitData;
    });
  }
  const result = copy as Partial<MlpData>;
  const mergePump = (fieldKey: keyof MlpData, legacy: keyof MlpData) => {
    const s = getMlpPumpSyottoValinta(
      m[fieldKey] as PumpunSyottoValinta | undefined,
      m[legacy] as boolean | undefined,
    );
    if (s === '230_1' || s === '400_3') (result as Record<string, unknown>)[fieldKey as string] = s;
  };
  mergePump('keruupiiriPumpunSyottoValinta', 'keruupiiriPumppuKolmeVaihetta');
  mergePump('keruuJaahdytysPumpunSyottoValinta', 'keruuJaahdytysPumppuKolmeVaihetta');
  mergePump('latausPumpunSyottoValinta', 'latausPumppuKolmeVaihetta');
  mergePump('latausTulistusPumpunSyottoValinta', 'latausTulistusPumppuKolmeVaihetta');
  const kk = getKokoLaiteSahkoVaiheValinta(m);
  if (kk === '1' || kk === '3') result.kokoLaiteSahkoVaiheValinta = kk;
  if (m.kiinteistoPiiritSisallytetaan === false) result.kiinteistoPiiritSisallytetaan = false;
  return result;
}

/** Build equipment registry snapshot from full report data (config only, no measurements). */
export function buildHuoltoEquipmentTechnicalSnapshot(data: HuoltoReportData): Record<string, unknown> {
  const isMLP = data.laiteTyyppi === 'mlp';
  const konvektoriRows = field(data, 'konvektoriRows') ?? field(data, 'konvektoritData');
  const nestelauhduttimetVj = field(data, 'nestelauhduttimetVj');
  const sisayksikkoData = field(data, 'sisayksikkoData');
  const sisayksikkoMaara = Number(field(data, 'sisayksikkoMaara') ?? 0);

  const kylmaaineTyyppi = resolveKylmaaineTyyppi(data.kylmaaineTyyppi, data.kylmaaineLaatu);
  const gwp = kylmaaineTyyppi ? getRefrigerantGWP(kylmaaineTyyppi) : 0;

  const snapshot: EquipmentSnapshot = {
    laiteTyyppi: data.laiteTyyppi,
    laiteKayttotarkoitus: data.laiteKayttotarkoitus,
    kylmaaineLaatu: '',
    kylmaainePiireja: data.kylmaainePiireja,
    ...(kylmaaineTyyppi ? { kylmaaineTyyppi } : {}),
    ...(strField(data, 'kylmaaineValmistajaMaara')
      ? { kylmaaineValmistajaMaara: strField(data, 'kylmaaineValmistajaMaara') }
      : {}),
    ...(strField(data, 'kylmaaineLisattyMaara')
      ? { kylmaaineLisattyMaara: strField(data, 'kylmaaineLisattyMaara') }
      : {}),
    ...(strField(data, 'kylmaainePutkimatka')
      ? { kylmaainePutkimatka: strField(data, 'kylmaainePutkimatka') }
      : {}),
    ...(strField(data, 'kylmaaineMaaraPiiri1')
      ? { kylmaaineMaaraPiiri1: strField(data, 'kylmaaineMaaraPiiri1') }
      : {}),
    ...(strField(data, 'kylmaaineMaaraPiiri2')
      ? { kylmaaineMaaraPiiri2: strField(data, 'kylmaaineMaaraPiiri2') }
      : {}),
    ...(strField(data, 'kylmaaineMaaraPiiri3')
      ? { kylmaaineMaaraPiiri3: strField(data, 'kylmaaineMaaraPiiri3') }
      : {}),
    ...(strField(data, 'kylmaaineMaaraPiiri4')
      ? { kylmaaineMaaraPiiri4: strField(data, 'kylmaaineMaaraPiiri4') }
      : {}),
    ...(strField(data, 'kylmaaineMaaraYhteensa')
      ? { kylmaaineMaaraYhteensa: strField(data, 'kylmaaineMaaraYhteensa') }
      : {}),
    ...(strField(data, 'kylmaaineCO2Ekv')
      ? { kylmaaineCO2Ekv: strField(data, 'kylmaaineCO2Ekv') }
      : {}),
    ...(gwp > 0 ? { kylmaaineGwp: String(gwp) } : {}),
    kp1Data: stripRefrigerantCircuitForRegistry(data.kylmaainePiiri1),
    kp2Data: data.kylmaainePiiri2
      ? stripRefrigerantCircuitForRegistry(data.kylmaainePiiri2)
      : {},
    kp3Data: data.kylmaainePiiri3
      ? stripRefrigerantCircuitForRegistry(data.kylmaainePiiri3)
      : {},
    evaporatorData: huoltoFormShowsEvaporatorSection(data.laiteTyyppi, data.selectedModules)
      ? data.evaporatorData.map(stripEvaporatorForRegistry)
      : [],
    condenserData: data.condenserData.map(stripCondenserForRegistry),
    mlpData: isMLP && data.mlpData ? stripMlpDataForRegistry(data.mlpData) : null,
    ...(data.laiteKokoonpano ? { laiteKokoonpano: data.laiteKokoonpano } : {}),
    ...(trim(data.hoyrystimienMaara) ? { hoyrystimienMaara: trim(data.hoyrystimienMaara) } : {}),
    ...(trim(data.hoyrystimetPiireittain) ? { hoyrystimetPiireittain: trim(data.hoyrystimetPiireittain) } : {}),
    ...(trim(data.lauhduttimienMaara) ? { lauhduttimienMaara: trim(data.lauhduttimienMaara) } : {}),
    ...(trim(data.lauhdutinTyyppiLaite) ? { lauhdutinTyyppiLaite: trim(data.lauhdutinTyyppiLaite) } : {}),
    ...(() => {
      const cfg: Record<string, unknown> = {};
      for (const k of DEVICE_CONFIG_FIELDS) {
        const v = (data as Record<string, unknown>)[k];
        if (typeof v === 'boolean' || (typeof v === 'string' && v.trim())) cfg[k] = typeof v === 'string' ? v.trim() : v;
      }
      return Object.keys(cfg).length ? { laiteKonfiguraatio: cfg } : {};
    })(),
    ...(() => {
      const o = data.kenttaModuulit?.ohjaukset ?? {};
      const fixed: Record<string, string> = {};
      for (const k of OHJAUKSET_FIXED_FIELDS) if (trim(o[k])) fixed[k] = trim(o[k]);
      return Object.keys(fixed).length ? { ohjauksetKiinteat: fixed } : {};
    })(),
    ...(() => {
      const vj: Record<string, Record<string, unknown>> = {};
      for (const [group, keys] of Object.entries(VJ_FIXED_FIELDS)) {
        const src = (data as unknown as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
        if (!src || typeof src !== 'object') continue;
        const o: Record<string, unknown> = {};
        for (const k of keys) if (!isEmptyValue(src[k])) o[k] = typeof src[k] === 'string' ? trim(src[k]) : src[k];
        if (Object.keys(o).length) vj[group] = o;
      }
      return Object.keys(vj).length ? { vjKiinteat: vj } : {};
    })(),
    isMLP,
    ulkoyksikko: {
      ulkoyksikkoMalli: strField(data, 'ulkoyksikkoMalli'),
      ulkoyksikkoSarjanumero: strField(data, 'ulkoyksikkoSarjanumero'),
      ulkoyksikkoJaahdytysTeho: strField(data, 'ulkoyksikkoJaahdytysTeho'),
      ulkoyksikkoLammitysTeho: strField(data, 'ulkoyksikkoLammitysTeho'),
      ulkoyksikkoAsennustapa: strField(data, 'ulkoyksikkoAsennustapa'),
      ulkoyksikkoAsennustapaMuu: strField(data, 'ulkoyksikkoAsennustapaMuu'),
    },
    sisayksikko: {
      maara: sisayksikkoMaara,
      data: Array.isArray(sisayksikkoData)
        ? sisayksikkoData.map((u: Record<string, unknown>) => ({
            tyyppi: u.tyyppi,
            malli: u.malli,
            sarjanumero: u.sarjanumero,
            kondenssivesi: u.kondenssivesi,
            pumppuMalli: u.pumppuMalli,
          }))
        : [],
    },
  };

  if (Array.isArray(nestelauhduttimetVj) && nestelauhduttimetVj.length > 0) {
    const stripped = nestelauhduttimetVj
      .map((u) => stripNestelauhdutinUnitForRegistry(u as Record<string, unknown>))
      .filter((u) => Object.keys(u).length > 1);
    if (stripped.length) snapshot.nestelauhduttimetVj = stripped;
  }

  if (data.laiteTyyppi === 'konvektorit' && Array.isArray(konvektoriRows)) {
    snapshot.konvektorit = konvektoriRows.map((r: Record<string, unknown>) => ({
      tyyppi: trim(r.tyyppi),
      tunnus: trim(r.tunnus),
      huone: trim(r.huone),
      valmistaja: trim(r.valmistaja),
      malli: trim(r.malli),
      sarjanumero: trim(r.sarjanumero),
    }));
  }

  return snapshot as unknown as Record<string, unknown>;
}

function isEmptyValue(v: unknown): boolean {
  return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
}

/**
 * Laitekortin arvo täyttää vain tyhjän / oletusarvoisen kentän — raportin oma arvo säilyy.
 * `defaults` = tyhjän olion oletukset (boolean-oletus ei ole käyttäjän valinta).
 */
export function fillFromSnapshot<T extends object>(existing: T, snap: Partial<T>, defaults?: Partial<T>): T {
  const out = { ...existing } as Record<string, unknown>;
  const def = (defaults ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(snap as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cur = out[k];
    const isDefault = k in def && JSON.stringify(cur) === JSON.stringify(def[k]);
    if (isEmptyValue(cur) || isDefault) out[k] = v;
  }
  return out as T;
}

function mergeCompressorConfig(existing: CompressorData, snap: Partial<CompressorData>): CompressorData {
  const pick: Partial<CompressorData> = {};
  for (const k of ['tyyppi', 'valmistaja', 'malli', 'ohjaustapa', 'kontaktoriTyyppi', 'pehmokaynnistinTyyppi', 'taajuusmuuttajaTyyppi', 'ohjaustapaMuu', 'kompressorinVaiheValinta'] as const) {
    if (snap[k] !== undefined) (pick as Record<string, unknown>)[k] = snap[k];
  }
  return fillFromSnapshot(existing, pick, ensureRefrigerantCircuitData(null).kompressori1);
}

function mergeCircuitFromSnapshot(
  existing: RefrigerantCircuitData,
  snap: Record<string, unknown>,
): RefrigerantCircuitData {
  const base = ensureRefrigerantCircuitData(existing);
  const flat = Object.fromEntries(Object.entries(snap).filter(([k]) => !/^kompressori\d$/.test(k)));
  const merged = ensureRefrigerantCircuitData(
    fillFromSnapshot(base, flat as Partial<RefrigerantCircuitData>, ensureRefrigerantCircuitData(null)),
  );
  for (let i = 1; i <= 6; i++) {
    const key = `kompressori${i}` as 'kompressori1' | 'kompressori2' | 'kompressori3' | 'kompressori4' | 'kompressori5' | 'kompressori6';
    const snapComp = snap[key] as Partial<CompressorData> | undefined;
    if (snapComp) {
      merged[key] = mergeCompressorConfig(merged[key], snapComp);
    }
  }
  return merged;
}

function mergeEvaporatorFromSnapshot(existing: EvaporatorData, snap: Partial<EvaporatorData>): EvaporatorData {
  const base = ensureEvaporatorData(existing);
  return ensureEvaporatorData(fillFromSnapshot(base, snap, ensureEvaporatorData(undefined)));
}

function mergeCondenserFromSnapshot(existing: CondenserData, snap: Partial<CondenserData>): CondenserData {
  const base = ensureCondenserData(existing);
  return ensureCondenserData(fillFromSnapshot(base, snap, ensureCondenserData(undefined)));
}

/** Apply stored equipment snapshot config into an in-progress report form. */
export function applyEquipmentSnapshotToForm(
  form: HuoltoReportData,
  snapshot: Record<string, unknown> | null | undefined,
): Partial<HuoltoReportData> {
  if (!snapshot || typeof snapshot !== 'object') return {};

  const snap = snapshot as Partial<EquipmentSnapshot>;
  const patch: Partial<HuoltoReportData> = {};

  if (snap.laiteTyyppi) patch.laiteTyyppi = snap.laiteTyyppi;
  if (snap.laiteKayttotarkoitus != null) patch.laiteKayttotarkoitus = snap.laiteKayttotarkoitus;
  const kylmaaineTyyppi = resolveKylmaaineTyyppi(snap.kylmaaineTyyppi, snap.kylmaaineLaatu);
  if (kylmaaineTyyppi) {
    patch.kylmaaineTyyppi = kylmaaineTyyppi;
    patch.kylmaaineLaatu = '';
  }
  if (snap.kylmaainePiireja) patch.kylmaainePiireja = snap.kylmaainePiireja;

  for (const key of [
    'kylmaaineValmistajaMaara',
    'kylmaaineLisattyMaara',
    'kylmaainePutkimatka',
    'kylmaaineMaaraPiiri1',
    'kylmaaineMaaraPiiri2',
    'kylmaaineMaaraPiiri3',
    'kylmaaineMaaraPiiri4',
    'kylmaaineMaaraYhteensa',
    'kylmaaineCO2Ekv',
  ] as const) {
    const v = snap[key];
    if (v != null && trim(v)) (patch as Record<string, unknown>)[key] = trim(v);
  }

  const snapAny = snapshot as Record<string, unknown>;
  if (snapAny.laiteKokoonpano && typeof snapAny.laiteKokoonpano === 'object') {
    // Laitteen kokoonpano korvaa uuden raportin oletuksen (esitäyttö tehdään vain uudelle/linkitettävälle raportille).
    patch.laiteKokoonpano = fillFromSnapshot(
      (form.laiteKokoonpano ?? {}) as Record<string, unknown>,
      snapAny.laiteKokoonpano as Record<string, unknown>,
      (createEmptyHuoltoReportData().laiteKokoonpano ?? {}) as Record<string, unknown>,
    ) as unknown as HuoltoReportData['laiteKokoonpano'];
  }
  for (const k of ['hoyrystimienMaara', 'hoyrystimetPiireittain', 'lauhduttimienMaara', 'lauhdutinTyyppiLaite'] as const) {
    if (trim(snapAny[k]) && !trim((form as Record<string, unknown>)[k])) (patch as Record<string, unknown>)[k] = trim(snapAny[k]);
  }
  if (snapAny.laiteKonfiguraatio && typeof snapAny.laiteKonfiguraatio === 'object') {
    for (const [k, v] of Object.entries(snapAny.laiteKonfiguraatio as Record<string, unknown>)) {
      const cur = (form as Record<string, unknown>)[k];
      const curEmpty = cur == null || (typeof cur === 'string' && !cur.trim()) || typeof cur === 'boolean';
      // Boolean: raportin oletus ei ole käyttäjän valinta → laitekortin arvo voittaa uudella raportilla.
      if (curEmpty) (patch as Record<string, unknown>)[k] = v;
    }
  }
  // Piireittäinen höyrystinmäärä vain jos raportilla ei ole jo omaa kokonaismäärää (ei muuta olemassa olevaa määrää).
  if (trim(form.hoyrystimienMaara) && !patch.hoyrystimienMaara) delete (patch as Record<string, unknown>).hoyrystimetPiireittain;
  if (snapAny.ohjauksetKiinteat && typeof snapAny.ohjauksetKiinteat === 'object') {
    const current = form.kenttaModuulit?.ohjaukset ?? {};
    const filled: Record<string, string | boolean> = { ...current };
    for (const [k, v] of Object.entries(snapAny.ohjauksetKiinteat as Record<string, unknown>)) {
      if (!trim(current[k]) && trim(v)) filled[k] = trim(v);
    }
    patch.kenttaModuulit = { ...(form.kenttaModuulit ?? {}), ohjaukset: filled };
  }

  if (snapAny.vjKiinteat && typeof snapAny.vjKiinteat === 'object') {
    const emptyForm = createEmptyHuoltoReportData() as unknown as Record<string, unknown>;
    for (const [group, vals] of Object.entries(snapAny.vjKiinteat as Record<string, Record<string, unknown>>)) {
      if (!(group in VJ_FIXED_FIELDS) || !vals || typeof vals !== 'object') continue;
      const cur = ((form as unknown as Record<string, unknown>)[group] ?? emptyForm[group] ?? {}) as Record<string, unknown>;
      (patch as Record<string, unknown>)[group] = fillFromSnapshot(cur, vals, (emptyForm[group] ?? {}) as Record<string, unknown>);
    }
  }

  if (snap.kp1Data) {
    patch.kylmaainePiiri1 = mergeCircuitFromSnapshot(form.kylmaainePiiri1, snap.kp1Data);
  }
  if (snap.kp2Data && Object.keys(snap.kp2Data).length > 0) {
    patch.kylmaainePiiri2 = mergeCircuitFromSnapshot(
      form.kylmaainePiiri2 ?? ensureRefrigerantCircuitData(null),
      snap.kp2Data,
    );
  }
  if (snap.kp3Data && Object.keys(snap.kp3Data).length > 0) {
    patch.kylmaainePiiri3 = mergeCircuitFromSnapshot(
      form.kylmaainePiiri3 ?? ensureRefrigerantCircuitData(null),
      snap.kp3Data,
    );
  }

  if (Array.isArray(snap.evaporatorData) && snap.evaporatorData.length > 0) {
    patch.evaporatorData = snap.evaporatorData.map((ev, i) =>
      mergeEvaporatorFromSnapshot(form.evaporatorData[i] ?? ensureEvaporatorData(undefined), ev),
    );
  }

  if (Array.isArray(snap.condenserData) && snap.condenserData.length > 0) {
    patch.condenserData = snap.condenserData.map((co, i) =>
      mergeCondenserFromSnapshot(form.condenserData[i] ?? ensureCondenserData(undefined), co),
    );
  }

  if (snap.mlpData) {
    patch.mlpData = ensureMlpData(fillFromSnapshot(ensureMlpData(form.mlpData), snap.mlpData, ensureMlpData(null)));
  }

  if (snap.ulkoyksikko) {
    for (const [k, v] of Object.entries(snap.ulkoyksikko)) {
      if (v != null && trim(v)) (patch as Record<string, unknown>)[k] = trim(v);
    }
  }

  if (snap.sisayksikko) {
    patch.sisayksikkoMaara = snap.sisayksikko.maara;
    if (Array.isArray(snap.sisayksikko.data)) {
      patch.sisayksikkoData = snap.sisayksikko.data.map((snapUnit, index) =>
        ensureSisayksikkoData(
          fillFromSnapshot(
            form.sisayksikkoData[index] ?? createEmptySisayksikkoData(),
            stripSisayksikkoInspection(snapUnit as Partial<SisayksikkoData>),
            createEmptySisayksikkoData(),
          ),
        ),
      );
    }
  }

  if (Array.isArray(snap.nestelauhduttimetVj) && !(form.nestelauhduttimetVj?.length)) {
    patch.nestelauhduttimetVj = snap.nestelauhduttimetVj as NestelauhdutinUnitData[];
  }

  if (Array.isArray(snap.konvektorit) && snap.konvektorit.length > 0) {
    const registryRows = snap.konvektorit;
    const existing = form.konvektoriRows ?? [];
    if (konvektoriRowsHaveMaintenanceData(existing)) {
      // Raportilla on jo huoltotila — älä korvaa rekisterin tunnisteilla.
    } else if (konvektoriRowsHaveRegistryData(existing)) {
      patch.konvektoriRows = existing.map((row, index) => {
        const snapRow = registryRows[index];
        if (!snapRow) return ensureKonvektoriRow(row);
        return ensureKonvektoriRow({
          ...row,
          tunnus: trim(snapRow.tunnus) || row.tunnus,
          valmistaja: trim(snapRow.valmistaja) || row.valmistaja,
          malli: trim(snapRow.malli) || row.malli,
          sarjanumero: trim(snapRow.sarjanumero) || row.sarjanumero,
        });
      });
      if (registryRows.length > existing.length) {
        patch.konvektoriRows = [
          ...patch.konvektoriRows,
          ...registryRows.slice(existing.length).map((r) =>
            ensureKonvektoriRow({
              id: crypto.randomUUID(),
              tunnus: trim(r.tunnus),
              valmistaja: trim(r.valmistaja),
              malli: trim(r.malli),
              sarjanumero: trim(r.sarjanumero),
            }),
          ),
        ];
      }
    } else {
      patch.konvektoriRows = registryRows.map((r) =>
        ensureKonvektoriRow({
          id: crypto.randomUUID(),
          tunnus: trim(r.tunnus),
          valmistaja: trim(r.valmistaja),
          malli: trim(r.malli),
          sarjanumero: trim(r.sarjanumero),
        }),
      );
    }
  }

  // Raportin oma (ei-oletus) arvo säilyy: laitekortti täyttää vain tyhjät ylätason kentät.
  const emptyForm = createEmptyHuoltoReportData() as unknown as Record<string, unknown>;
  const formRec = form as unknown as Record<string, unknown>;
  for (const k of Object.keys(patch)) {
    const cur = formRec[k];
    if (cur !== null && typeof cur === 'object') continue; // oliot/taulukot yhdistetty yllä
    const isDefault = JSON.stringify(cur) === JSON.stringify(emptyForm[k]);
    if (!isEmptyValue(cur) && !isDefault) delete (patch as Record<string, unknown>)[k];
  }
  return patch;
}

/** Rekisterin tunnistetiedot eivät tuo edellisen käynnin tarkastustuloksia (ei oletusvalintaa). */
function stripSisayksikkoInspection(unit: Partial<SisayksikkoData>): Partial<SisayksikkoData> {
  const { asennettu: _a, kennoPuhdas: _k, eiAania: _e, kondenssiTestattu: _t, ...rest } = unit;
  return rest;
}

export type ReportEquipmentSyncOptions = {
  /** Käyttäjä muokkasi kylmäainetta tässä pöytäkirjassa → pöytäkirjan arvo päivittää laitekortin. */
  refrigerantEdited?: boolean;
};

/**
 * Kylmäaine: laitekortti on lähde. Tilannekuvaan kirjoitetaan laitekortin arvo (ei vanhentunutta
 * pöytäkirjan kopiota), ja vain tässä pöytäkirjassa tehty muokkaus päivittää laitekortin.
 */
async function mirrorRefrigerantToSnapshot(
  supabase: SupabaseClient,
  equipmentId: string,
  snapshot: Record<string, unknown>,
  prevSnapshot: unknown,
  edited: boolean,
): Promise<Record<string, unknown>> {
  const columnMap = await loadEquipmentDeviceFields(supabase, [equipmentId]);
  const columns = columnMap?.get(equipmentId) ?? null;
  const card = effectiveDeviceFields(columns, prevSnapshot);
  let target = { refrigerant: card.refrigerant, refrigerant_charge_kg: card.refrigerant_charge_kg };
  if (edited) {
    const report = refrigerantFieldsFromReport(snapshot);
    target = {
      refrigerant: report.refrigerant ?? card.refrigerant,
      refrigerant_charge_kg: report.refrigerant_charge_kg ?? card.refrigerant_charge_kg,
    };
    if (columnMap) {
      const patch: Record<string, unknown> = {};
      if (target.refrigerant && target.refrigerant !== columns?.refrigerant) patch.refrigerant = target.refrigerant;
      if (target.refrigerant_charge_kg != null && target.refrigerant_charge_kg !== columns?.refrigerant_charge_kg) {
        patch.refrigerant_charge_kg = target.refrigerant_charge_kg;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('equipment').update(patch).eq('id', equipmentId);
        if (error) throw new Error(error.message);
      }
    }
  }
  return snapshotWithRefrigerant(snapshot, target);
}

/** Persist latest technical snapshot and device type on linked equipment after submit. */
export async function syncEquipmentFromReport(
  equipmentId: string,
  snapshot: Record<string, unknown>,
  supabase: SupabaseClient,
  identity?: { serial_number?: string; model?: string; manufacturer?: string },
  opts: ReportEquipmentSyncOptions = {},
): Promise<void> {
  const deviceType = trim(snapshot.laiteTyyppi) || null;
  // ILP: laitteen sarjanumero/malli pidetään samana kuin ulkoyksikön (vain oikeat arvot).
  const identityPatch: Record<string, string> = {};
  if (identity?.serial_number?.trim()) identityPatch.serial_number = identity.serial_number.trim();
  if (identity?.model?.trim()) identityPatch.model = identity.model.trim();
  const { data: prevRow } = await supabase.from('equipment').select('huolto_technical_snapshot').eq('id', equipmentId).maybeSingle();
  const prevSnapshot = (prevRow as { huolto_technical_snapshot?: unknown } | null)?.huolto_technical_snapshot;
  const mirrored = await mirrorRefrigerantToSnapshot(supabase, equipmentId, snapshot, prevSnapshot, Boolean(opts.refrigerantEdited));
  const { error } = await supabase
    .from('equipment')
    .update({
      huolto_technical_snapshot: carryHuoltoAsetukset(mirrored, prevSnapshot),
      device_type: deviceType,
      ...identityPatch,
    })
    .eq('id', equipmentId);

  if (error) throw new Error(error.message);
  await fillEmptyEquipmentDeviceFields(supabase, equipmentId, {
    manufacturer: typeof identity?.manufacturer === 'string' ? identity.manufacturer : null,
    refrigerant: deviceFieldsFromSnapshot(mirrored).refrigerant,
    refrigerant_charge_kg: deviceFieldsFromSnapshot(mirrored).refrigerant_charge_kg ?? refrigerantFieldsFromReport(mirrored).refrigerant_charge_kg,
  });
}

function equipmentNameFromForm(form: HuoltoReportData): string {
  if (form.laiteTyyppi === 'konvektorit') {
    return trim(form.laiteKayttotarkoitus) || trim(form.laiteSijainti) || trim(form.laiteTunnus) || 'Konvektoriverkosto';
  }
  return trim(form.laiteTunnus) || trim(form.laiteMalli) || trim(form.laiteValmistaja) || 'Laite';
}

function deviceFieldsFromReport(form: HuoltoReportData, snapshot: Record<string, unknown>) {
  const fromSnap = deviceFieldsFromSnapshot(snapshot);
  return {
    manufacturer: realIdentityValue(form.laiteValmistaja) || null,
    refrigerant: fromSnap.refrigerant,
    refrigerant_charge_kg: fromSnap.refrigerant_charge_kg ?? refrigerantFieldsFromReport(snapshot).refrigerant_charge_kg,
  };
}

/** Create or update equipment row from report laitetiedot + technical snapshot. */
export async function saveEquipmentFromReport(
  form: HuoltoReportData,
  customerId: string,
  ownerCompanyId: string,
  equipmentId: string | null,
  supabase: SupabaseClient,
  opts: ReportEquipmentSyncOptions = {},
): Promise<string> {
  const snapshot = buildHuoltoEquipmentTechnicalSnapshot(form);
  const payload = {
    owner_company_id: ownerCompanyId,
    customer_id: customerId,
    name: equipmentNameFromForm(form),
    tag: trim(form.laiteTunnus) || null,
    model: (isIlpDevice(form.laiteTyyppi) ? ilpDeviceModel(form) : '') || realIdentityValue(form.laiteMalli) || null,
    // ILP: laitteen sarjanumero = ulkoyksikön sarjanumero.
    serial_number: (isIlpDevice(form.laiteTyyppi) ? ilpDeviceSerial(form) : '') || realIdentityValue(form.laiteSarjanumero) || null,
    location: trim(form.laiteSijainti) || null,
    device_type: trim(form.laiteTyyppi) || null,
    huolto_technical_snapshot: snapshot,
  };

  if (equipmentId) {
    // Päivityksessä tyhjät / täyttöarvot ("—", "ei tiedossa") eivät pyyhi rekisterin tietoja.
    const updatePayload: Record<string, unknown> = { ...payload };
    for (const key of ['tag', 'model', 'serial_number', 'location', 'device_type'] as const) {
      if (!realIdentityValue(updatePayload[key])) delete updatePayload[key];
    }
    if (!realIdentityValue(form.laiteTunnus) && !realIdentityValue(form.laiteMalli)) delete updatePayload.name;
    delete updatePayload.owner_company_id;
    delete updatePayload.customer_id;
    const { data: prevRow } = await supabase.from('equipment').select('huolto_technical_snapshot').eq('id', equipmentId).maybeSingle();
    const prevSnapshot = (prevRow as { huolto_technical_snapshot?: unknown } | null)?.huolto_technical_snapshot;
    const mirrored = await mirrorRefrigerantToSnapshot(supabase, equipmentId, snapshot, prevSnapshot, Boolean(opts.refrigerantEdited));
    updatePayload.huolto_technical_snapshot = carryHuoltoAsetukset(mirrored, prevSnapshot);
    const { error } = await supabase.from('equipment').update(updatePayload).eq('id', equipmentId);
    if (error) throw new Error(error.message);
    await fillEmptyEquipmentDeviceFields(supabase, equipmentId, deviceFieldsFromReport(form, mirrored));
    return equipmentId;
  }

  const { data, error } = await supabase.from('equipment').insert(payload).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Laitteen luonti epäonnistui.');
  await fillEmptyEquipmentDeviceFields(supabase, data.id as string, deviceFieldsFromReport(form, snapshot));
  return data.id as string;
}

export function mergeFormWithEquipmentSnapshot(
  form: HuoltoReportData,
  snapshot: Record<string, unknown> | null | undefined,
): HuoltoReportData {
  return mergeHuoltoReportData(form, applyEquipmentSnapshotToForm(form, snapshot));
}
