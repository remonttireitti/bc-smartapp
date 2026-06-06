import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureCondenserData,
  ensureEvaporatorData,
  ensureMlpData,
  ensureRefrigerantCircuitData,
  mergeHuoltoReportData,
} from './defaults';
import {
  getCompressorVaiheValinta,
  getCondenserFanVaiheValinta,
  getKokoLaiteSahkoVaiheValinta,
  getMlpPumpSyottoValinta,
} from './sahkoVaiheUtils';
import { ensureKonvektoriRow, konvektoriRowsHaveMaintenanceData } from './defaults';
import type {
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

const MLP_DROP: (keyof MlpData)[] = [
  'keruupiirinPaineTarkastettu',
  'keruupiiriPaineBar',
  'keruupiirissaMutapussiPuhdistettu',
  'keruupiirinPumppuTarkastettu',
  'keruupiirinEristeetKunnossa',
  'keruupiirissaAutomaattinenIlmausTarkistettu',
  'keruupiiriVirtaus',
  'keruupiiriMeno',
  'keruupiiriTulo',
  'keruupiiriPumppuKolmeVaihetta',
  'keruupiiriPumppuVirta1vaihe',
  'keruupiiriPumppuVirtaL1',
  'keruupiiriPumppuVirtaL2',
  'keruupiiriPumppuVirtaL3',
  'keruuPaisuntaAstiaTarkistettu',
  'keruuJaahdytysMenoLampotila',
  'keruuJaahdytysPaluuLampotila',
  'keruuJaahdytysVirtaus',
  'keruuJaahdytysKayntivirta',
  'keruuJaahdytysPumppuKolmeVaihetta',
  'keruuJaahdytysPumppuVirta1vaihe',
  'keruuJaahdytysPumppuVirtaL1',
  'keruuJaahdytysPumppuVirtaL2',
  'keruuJaahdytysPumppuVirtaL3',
  'latausPaineTarkastettu',
  'latausPaineBar',
  'latausMutapussiPuhdistettu',
  'latausPumppuTarkastettu',
  'latausEristeetKunnossa',
  'latausAutomaattinenIlmausTarkistettu',
  'latausPumppuKolmeVaihetta',
  'latausPumppuVirta1vaihe',
  'latausPumppuVirtaL1',
  'latausPumppuVirtaL2',
  'latausPumppuVirtaL3',
  'latausVirtaus',
  'latausMeno',
  'latausTulo',
  'latausPaisuntaAstiaTarkistettu',
  'latausTulistusPumppuKolmeVaihetta',
  'latausTulistusPumppuVirta1vaihe',
  'latausTulistusPumppuVirtaL1',
  'latausTulistusPumppuVirtaL2',
  'latausTulistusPumppuVirtaL3',
  'latausTulistusVirtaus',
  'latausTulistusMeno',
  'latausTulistusTulo',
  'kayttovesiLampotilaNykyinen',
  'kayttovesiToimilaitteetOK',
  'kayttovesiKiertoVirtaus',
  'kayttovesiKiertoKayntivirta',
  'keruupiiriTehoLaskenta',
  'lampoPaisuntaAstiaTarkistettu',
  'lampoToimilaitteetOK',
  'lampoAutomaattinenIlmausTarkistettu',
  'lampoMutapussiPuhdistettu',
  'kylmaainePaetosTarkastettu',
  'kylmaaineVuotoja',
  'kylmaainePaineLauhdutinBar',
  'kylmaaineKyllaestymisLampotila',
  'kylmaaineNestePutkiLampotila',
  'kylmaaineAlijaahdytys',
  'mittaaKokoLaiteSahko',
  'kokoLaiteSahkoKolmeVaihetta',
  'kokoLaiteVirta1vaihe',
  'kokoLaiteVirtaL1',
  'kokoLaiteVirtaL2',
  'kokoLaiteVirtaL3',
];

export function stripMlpDataForRegistry(m: MlpData): Partial<MlpData> {
  const copy = { ...m } as Record<string, unknown>;
  for (const k of MLP_DROP) delete copy[k as string];
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
            asennettu: u.asennettu,
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
      tunnus: trim(r.tunnus),
      valmistaja: trim(r.valmistaja),
      malli: trim(r.malli),
      sarjanumero: trim(r.sarjanumero),
    }));
  }

  return snapshot as unknown as Record<string, unknown>;
}

function mergeCompressorConfig(existing: CompressorData, snap: Partial<CompressorData>): CompressorData {
  return {
    ...existing,
    tyyppi: snap.tyyppi ?? existing.tyyppi,
    valmistaja: snap.valmistaja ?? existing.valmistaja,
    malli: snap.malli ?? existing.malli,
    ohjaustapa: snap.ohjaustapa ?? existing.ohjaustapa,
    kontaktoriTyyppi: snap.kontaktoriTyyppi ?? existing.kontaktoriTyyppi,
    pehmokaynnistinTyyppi: snap.pehmokaynnistinTyyppi ?? existing.pehmokaynnistinTyyppi,
    taajuusmuuttajaTyyppi: snap.taajuusmuuttajaTyyppi ?? existing.taajuusmuuttajaTyyppi,
    ohjaustapaMuu: snap.ohjaustapaMuu ?? existing.ohjaustapaMuu,
    kompressorinVaiheValinta: snap.kompressorinVaiheValinta ?? existing.kompressorinVaiheValinta,
  };
}

function mergeCircuitFromSnapshot(
  existing: RefrigerantCircuitData,
  snap: Record<string, unknown>,
): RefrigerantCircuitData {
  const base = ensureRefrigerantCircuitData(existing);
  const merged = ensureRefrigerantCircuitData({ ...base, ...snap } as Partial<RefrigerantCircuitData>);
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
  return ensureEvaporatorData({ ...base, ...snap, puhaltimet: snap.puhaltimet ?? base.puhaltimet });
}

function mergeCondenserFromSnapshot(existing: CondenserData, snap: Partial<CondenserData>): CondenserData {
  const base = ensureCondenserData(existing);
  return ensureCondenserData({ ...base, ...snap, puhaltimet: snap.puhaltimet ?? base.puhaltimet });
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
    patch.mlpData = ensureMlpData({ ...ensureMlpData(form.mlpData), ...snap.mlpData });
  }

  if (snap.ulkoyksikko) {
    for (const [k, v] of Object.entries(snap.ulkoyksikko)) {
      if (v != null && trim(v)) (patch as Record<string, unknown>)[k] = trim(v);
    }
  }

  if (snap.sisayksikko) {
    patch.sisayksikkoMaara = snap.sisayksikko.maara;
    if (Array.isArray(snap.sisayksikko.data)) {
      patch.sisayksikkoData = snap.sisayksikko.data as SisayksikkoData[];
    }
  }

  if (Array.isArray(snap.nestelauhduttimetVj)) {
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

  return patch;
}

/** Persist latest technical snapshot and device type on linked equipment after submit. */
export async function syncEquipmentFromReport(
  equipmentId: string,
  snapshot: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<void> {
  const deviceType = trim(snapshot.laiteTyyppi) || null;
  const { error } = await supabase
    .from('equipment')
    .update({
      huolto_technical_snapshot: snapshot,
      device_type: deviceType,
    })
    .eq('id', equipmentId);

  if (error) throw new Error(error.message);
}

function equipmentNameFromForm(form: HuoltoReportData): string {
  return trim(form.laiteTunnus) || trim(form.laiteMalli) || trim(form.laiteValmistaja) || 'Laite';
}

/** Create or update equipment row from report laitetiedot + technical snapshot. */
export async function saveEquipmentFromReport(
  form: HuoltoReportData,
  customerId: string,
  ownerCompanyId: string,
  equipmentId: string | null,
  supabase: SupabaseClient,
): Promise<string> {
  const snapshot = buildHuoltoEquipmentTechnicalSnapshot(form);
  const payload = {
    owner_company_id: ownerCompanyId,
    customer_id: customerId,
    name: equipmentNameFromForm(form),
    tag: trim(form.laiteTunnus) || null,
    model: trim(form.laiteMalli) || null,
    serial_number: trim(form.laiteSarjanumero) || null,
    location: trim(form.laiteSijainti) || null,
    device_type: trim(form.laiteTyyppi) || null,
    huolto_technical_snapshot: snapshot,
  };

  if (equipmentId) {
    const { error } = await supabase.from('equipment').update(payload).eq('id', equipmentId);
    if (error) throw new Error(error.message);
    return equipmentId;
  }

  const { data, error } = await supabase.from('equipment').insert(payload).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Laitteen luonti epäonnistui.');
  return data.id as string;
}

export function mergeFormWithEquipmentSnapshot(
  form: HuoltoReportData,
  snapshot: Record<string, unknown> | null | undefined,
): HuoltoReportData {
  return mergeHuoltoReportData(form, applyEquipmentSnapshotToForm(form, snapshot));
}
