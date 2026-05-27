import {
  defaultCondenserTypeForDevice,
  isChillerLikeDevice,
  isHeatPumpCircuitsDevice,
  isLiquidCondenserType,
  resolveAutoModules,
  usesManualModuleMenu,
  stripMagnetValveFromCircuit,
} from './deviceModuleLogic';
import { applyLegacyHuoltoFields, inferModulesFromLegacyData, mapLegacyMlpKeruupiiriToJaahdytysvesi, mergeLegacySelectedModules } from './legacyImport';
import { normalizeEvaporatorForDevice } from './evaporatorHelpers';
import { buildMaintenanceReportTitle } from '../../types';
import { deviceTypes, isMlpVesiNeste, type ModuleKey } from './constants';
import type {
  CompressorData,
  CondenserData,
  CondenserFanData,
  EvaporatorData,
  FanPhaseType,
  HeatingCircuitData,
  HeatingElementData,
  HuoltoReportData,
  HuomiotImageAttachment,
  JaahdytysvesiData,
  KonvektoriRowData,
  LauhdutuspiiriData,
  NestepiiriData,
  MittausSisayksikkoData,
  MlpData,
  NestelauhdutinUnitData,
  RefrigerantCircuitData,
  SisayksikkoData,
  TiiveyskoeData,
  TyhjiointiData,
  VjOhjausData,
} from './types';
import { inferLegacyMlpFlags } from './mlpLegacyFlags';
import { normalizeMaintenanceReportPhotos } from '../maintenanceReportPhotoUtils';
import { generateId, resolveKylmaaineTyyppi } from './utils';

export function createEmptyKonvektoriRow(): KonvektoriRowData {
  return {
    id: generateId(),
    tunnus: '',
    valmistaja: '',
    malli: '',
    sarjanumero: '',
    suodatinPuhdistettu: false,
    kennoPuhdistettu: false,
    kondenssiTarkastettu: false,
    puhallinTarkastettu: false,
    venttiiliTarkastettu: false,
    huomio: '',
    huomioTyyppi: 'kommentti',
  };
}

export function createEmptySisayksikkoData(): SisayksikkoData {
  return {
    tyyppi: '',
    malli: '',
    sarjanumero: '',
    kondenssivesi: '',
    pumppuMalli: '',
    asennettu: false,
    kennoPuhdas: false,
    eiAania: false,
    kondenssiTestattu: false,
  };
}

export function createEmptyMittausSisayksikkoData(): MittausSisayksikkoData {
  return {
    imupaineJaahdytys: '',
    korkeapaineJaahdytys: '',
    imupaineLammitys: '',
    korkeapaineLammitys: '',
    sisalampotila: '',
    paluuLampotila: '',
    puhallusLampotila: '',
    ilmanmaaraM3h: '',
  };
}

/** @deprecated Use createEmptyMittausSisayksikkoData */
export const createEmptySisayksikkoMittausData = createEmptyMittausSisayksikkoData;

export function createEmptyNestelauhdutinUnit(): NestelauhdutinUnitData {
  return {
    id: generateId(),
    lauhdutuspiiri: createEmptyLauhdutuspiiriData(),
    lauhdutinPuhdistettu: false,
    lauhdutinPuhdistusTapa: '',
    valmistaja: '',
    malli: '',
    sarjanumero: '',
    puhaltimienMaara: 1,
    puhallinSyotto: '400',
    puhaltimienValmistaja: '',
    puhaltimienMalli: '',
    puhallinOhjausTapa: '',
    ohjausLahde: '',
    puhallinMoottoriVirratMitattu: false,
    puhaltimet: [
      {
        id: 1,
        phase: 3 as FanPhaseType,
        jannite: '400',
        virtaL1: '',
        virtaL2: '',
        virtaL3: '',
      },
    ],
  };
}

export function ensureKonvektoriRow(data: Partial<KonvektoriRowData> | undefined): KonvektoriRowData {
  const base = createEmptyKonvektoriRow();
  if (!data) return base;
  return { ...base, ...data };
}

export function ensureSisayksikkoData(data: Partial<SisayksikkoData> | undefined): SisayksikkoData {
  const base = createEmptySisayksikkoData();
  if (!data) return base;
  return { ...base, ...data };
}

export function ensureMittausSisayksikkoData(
  data: Partial<MittausSisayksikkoData> | undefined,
): MittausSisayksikkoData {
  const base = createEmptyMittausSisayksikkoData();
  if (!data) return base;
  return { ...base, ...data };
}

export function ensureNestelauhdutinUnit(data: Partial<NestelauhdutinUnitData> | undefined): NestelauhdutinUnitData {
  const base = createEmptyNestelauhdutinUnit();
  if (!data) return base;
  return {
    ...base,
    ...data,
    id: data.id ?? base.id,
    lauhdutuspiiri: ensureLauhdutuspiiriData(data.lauhdutuspiiri ?? base.lauhdutuspiiri),
    puhaltimet: (data.puhaltimet ?? base.puhaltimet).map((f, i) => ({
      ...createEmptyEvaporatorFan(i + 1),
      ...f,
    })),
  };
}

export function ensureHuomiotLiite(data: Partial<HuomiotImageAttachment> | undefined): HuomiotImageAttachment {
  return {
    id: data?.id ?? generateId(),
    url: data?.url ?? '',
    comment: data?.comment ?? '',
    storagePath: data?.storagePath,
    fileName: data?.fileName,
    contentType: data?.contentType,
    createdAt: data?.createdAt,
  };
}

export function createEmptyEvaporatorFan(id: number): CondenserFanData {
  return {
    id,
    phase: 1,
    jannite: '230',
    vaiheValinta: '1',
    virtaL1: '',
    virtaL2: '',
    virtaL3: '',
  };
}

export function createEmptyCondenserData(): CondenserData {
  return {
    tyyppi: undefined,
    lauhdutinPuhdistettu: false,
    lauhdutinPuhdistusTapa: '',
    puhaltimienMaara: 1,
    puhaltimet: [createEmptyEvaporatorFan(1)],
    puhallinOhjaus: undefined,
    puhallinOhjausMuu: '',
    nopeussäädinMalli: '',
    taajusmuuntajaMalli: '',
    kpPressostaattiMalli: '',
    talvivarustus: false,
    talvivarustusTapa: '',
    painesäätimenTarkistettu: false,
    painesäätimenMalli: '',
    virtausRiittävä: true,
    virtausOngelma: '',
  };
}

export function createEmptyLiquidCircuitData() {
  return {
    neste: '',
    virtaus: '',
    meno: '',
    tulo: '',
    pumppuTarkastettu: false,
    pumppuValmistaja: '',
    pumppuMalli: '',
  };
}

export function createEmptyNestepiiriData(): NestepiiriData {
  return {
    ...createEmptyLiquidCircuitData(),
    paisuntaAstiaTarkistettu: false,
    paisuntaAstiaKoko: '',
    paisuntaAstiaEsipaine: '',
    paineTarkastettu: false,
    paineBar: '',
    automaattinenIlmausTarkistettu: false,
    mutapussiPuhdistettu: false,
    toimilaitteetOK: false,
  };
}

export function createEmptyLauhdutuspiiriData(): LauhdutuspiiriData {
  return {
    ...createEmptyNestepiiriData(),
    painesäätimenTarkistettu: false,
    painesäätimenMalli: '',
    virtausRiittävä: true,
    virtausOngelma: '',
  };
}

export function ensureNestepiiriData(data: Partial<NestepiiriData> | undefined): NestepiiriData {
  return { ...createEmptyNestepiiriData(), ...data };
}

export function ensureLauhdutuspiiriData(data: Partial<LauhdutuspiiriData> | undefined): LauhdutuspiiriData {
  return { ...createEmptyLauhdutuspiiriData(), ...data };
}

export function createEmptyVjOhjausData(): VjOhjausData {
  return {
    ohjausValmistaja: '',
    lauhdutusOhjausLahde: '',
    asetusArvot: '',
    kuvaus: '',
  };
}

export function ensureVjOhjausData(data: Partial<VjOhjausData> | undefined): VjOhjausData {
  return { ...createEmptyVjOhjausData(), ...data };
}

export function createEmptyJaahdytysvesiData(): JaahdytysvesiData {
  return createEmptyNestepiiriData();
}

function mergeLauhdutuspiiriData(data: Partial<HuoltoReportData>): LauhdutuspiiriData {
  const legacyUnitPiiri = data.nestelauhduttimetVj?.[0]?.lauhdutuspiiri;
  return ensureLauhdutuspiiriData({
    ...createEmptyLauhdutuspiiriData(),
    ...legacyUnitPiiri,
    ...data.lauhdutuspiiriData,
  });
}

export function ensureChillerLiquidCondenserData(data: Partial<HuoltoReportData>): Partial<HuoltoReportData> {
  return {
    lauhdutuspiiriData: mergeLauhdutuspiiriData(data),
    nestelauhduttimetVj: data.nestelauhduttimetVj?.length
      ? data.nestelauhduttimetVj.map(ensureNestelauhdutinUnit)
      : [createEmptyNestelauhdutinUnit()],
    vjNestelauhdutusJaettu: data.vjNestelauhdutusJaettu ?? true,
  };
}

function mergeChillerCoolingCircuit(
  jaahdytysvesi: Partial<JaahdytysvesiData> | undefined,
  legacyHoyrystinPiiri: Partial<NestepiiriData> | undefined,
): JaahdytysvesiData {
  return ensureNestepiiriData({
    ...createEmptyJaahdytysvesiData(),
    ...legacyHoyrystinPiiri,
    ...jaahdytysvesi,
  });
}

export function createEmptyVapaajahdytysData() {
  return {
    ...createEmptyLiquidCircuitData(),
    ohjaus: '' as const,
  };
}

export function createEmptyTiiveyskoeData(): TiiveyskoeData {
  return {
    testipaineBar: '',
    kestoMin: '',
    koeAlkaaPvm: '',
    koeAlkaaKlo: '',
    testauslampotila: '',
    tulos: '',
    menetelma: '',
    huom: '',
    todisteKuvat: [],
  };
}

export function createEmptyTyhjiointiData(): TyhjiointiData {
  return {
    loppupaineArvo: '',
    loppupaineYksikko: 'micron',
    kestoMin: '',
    koeAlkaaPvm: '',
    koeAlkaaKlo: '',
    tulos: '',
    kaytettyPainemittari: '',
    huom: '',
    todisteKuvat: [],
  };
}

export function ensureCondenserData(data: Partial<CondenserData> | undefined): CondenserData {
  const base = createEmptyCondenserData();
  if (!data) return base;
  return {
    ...base,
    ...data,
    puhaltimet: (data.puhaltimet ?? base.puhaltimet ?? []).map((f, i) => ({
      ...createEmptyEvaporatorFan(i + 1),
      ...f,
    })),
  };
}

export function ensureTiiveyskoeData(data: Partial<TiiveyskoeData> | undefined): TiiveyskoeData {
  const base = createEmptyTiiveyskoeData();
  if (!data) return base;
  return {
    ...base,
    ...data,
    todisteKuvat: normalizeMaintenanceReportPhotos(data.todisteKuvat ?? base.todisteKuvat),
  };
}

export function ensureTyhjiointiData(data: Partial<TyhjiointiData> | undefined): TyhjiointiData {
  const base = createEmptyTyhjiointiData();
  if (!data) return base;
  const legacy = data as Record<string, unknown>;
  const loppupaineArvo =
    data.loppupaineArvo ||
    (legacy.loppupaineMikronia != null ? String(legacy.loppupaineMikronia).trim() : '');
  return {
    ...base,
    ...data,
    loppupaineArvo,
    loppupaineYksikko:
      data.loppupaineYksikko ||
      (loppupaineArvo && !data.loppupaineYksikko ? 'micron' : base.loppupaineYksikko),
    kaytettyPainemittari:
      data.kaytettyPainemittari ||
      (typeof legacy.pumpunTyyppi === 'string' ? legacy.pumpunTyyppi.trim() : ''),
    todisteKuvat: normalizeMaintenanceReportPhotos(data.todisteKuvat ?? base.todisteKuvat),
  };
}

export function createEmptyEvaporatorData(laiteTyyppi?: string): EvaporatorData {
  const chiller = laiteTyyppi != null && laiteTyyppi !== '' && isChillerLikeDevice(laiteTyyppi);
  return {
    tyyppi: chiller ? 'levy' : 'staatinen',
    huoneenTunnus: '',
    valmistaja: '',
    malli: '',
    sarjanumero: '',
    sulatus: 'ilma',
    sahkoJannite: '230',
    sahkoVirtaMitattu: false,
    sahkoVirtaL1: '',
    sahkoVirtaL2: '',
    sahkoVirtaL3: '',
    sulatusOhjausMuu: '',
    sulatusKelloMalli: '',
    sulatusSäädinMalli: '',
    sulatusKertojaPäivässä: '',
    sulatusAika: '',
    sulatusLopetusLämpötila: '',
    puhaltimienMaara: chiller ? 0 : 1,
    puhaltimet: chiller ? [] : [createEmptyEvaporatorFan(1)],
  };
}

export function createEmptyHeatingElementData(): HeatingElementData {
  return {
    tunnus: '',
    teho: '',
    jannite: '',
    asetusarvo: '',
    ohjaustapa: '',
    toimintaTestattu: false,
  };
}

export function cloneKonvektoriRow(row?: KonvektoriRowData): KonvektoriRowData {
  return {
    ...(row ?? createEmptyKonvektoriRow()),
    id: generateId(),
  };
}

export function createEmptyHeatingCircuitData(): HeatingCircuitData {
  return {
    jakotapa: '',
    jakotapaMuu: '',
    pumppuTyyppi: '',
    pumppuVirta1vaihe: '',
    pumppuVirtaL1: '',
    pumppuVirtaL2: '',
    pumppuVirtaL3: '',
    virtaus: '',
    meno: '',
    tulo: '',
    neste: '',
  };
}

export function createEmptyMlpData(): MlpData {
  return {
    keruupiirinPaineTarkastettu: false,
    keruupiiriPaineBar: '',
    keruupiirissaMutapussiPuhdistettu: false,
    keruupiirinPumppuTarkastettu: false,
    keruupiirinEristeetKunnossa: false,
    keruupiirissaAutomaattinenIlmausTarkistettu: false,
    keruupiiriVirtaus: '',
    keruupiiriMeno: '',
    keruupiiriTulo: '',
    keruupiirinPumpunTyyppi: '',
    keruupiiriPumpunValmistaja: '',
    keruupiiriPumpunMalli: '',
    keruupiiriPumpunSyottoValinta: '',
    keruupiiriPumppuVirta1vaihe: '',
    keruupiiriPumppuVirtaL1: '',
    keruupiiriPumppuVirtaL2: '',
    keruupiiriPumppuVirtaL3: '',
    keruupiiriNeste: '',
    keruupiiriTehoLaskenta: '',
    keruuPaisuntaAstiaTarkistettu: false,
    keruuPaisuntaAstiaKoko: '',
    keruuPaisuntaAstiaEsipaine: '',
    keruuJaahdytysPiiri: false,
    keruuJaahdytysPiiriPumppu: false,
    keruuJaahdytysPumppuTyyppi: '',
    keruuJaahdytysPumpunValmistaja: '',
    keruuJaahdytysPumpunMalli: '',
    keruuJaahdytysPumpunSyottoValinta: '',
    keruuJaahdytysPumppuVirta1vaihe: '',
    keruuJaahdytysPumppuVirtaL1: '',
    keruuJaahdytysPumppuVirtaL2: '',
    keruuJaahdytysPumppuVirtaL3: '',
    keruuJaahdytysVirtaus: '',
    keruuJaahdytysKayntivirta: '',
    keruuJaahdytysMenoLampotila: '',
    keruuJaahdytysPaluuLampotila: '',
    latausPaineTarkastettu: false,
    latausPaineBar: '',
    latausMutapussiPuhdistettu: false,
    latausPumppuTarkastettu: false,
    latausEristeetKunnossa: false,
    latausAutomaattinenIlmausTarkistettu: false,
    latausPumpunTyyppi: '',
    latausPumpunValmistaja: '',
    latausPumpunMalli: '',
    latausPumpunSyottoValinta: '',
    latausPumppuVirta1vaihe: '',
    latausPumppuVirtaL1: '',
    latausPumppuVirtaL2: '',
    latausPumppuVirtaL3: '',
    latausVirtaus: '',
    latausMeno: '',
    latausTulo: '',
    latausNeste: '',
    latausPaisuntaAstiaTarkistettu: false,
    latausPaisuntaAstiaKoko: '',
    latausPaisuntaAstiaEsipaine: '',
    latausTulistuspiiri: false,
    latausTulistuspiiriPumppu: false,
    latausTulistusPumppuTyyppi: '',
    latausTulistusPumpunValmistaja: '',
    latausTulistusPumpunMalli: '',
    latausTulistusPumpunSyottoValinta: '',
    latausTulistusPumppuVirta1vaihe: '',
    latausTulistusPumppuVirtaL1: '',
    latausTulistusPumppuVirtaL2: '',
    latausTulistusPumppuVirtaL3: '',
    latausTulistusVirtaus: '',
    latausTulistusMeno: '',
    latausTulistusTulo: '',
    latausTulistusNeste: '',
    latausJarjestelmanNeste: '',
    latausGlykoliPakkaskestavyys: '',
    kayttovesiEnabled: false,
    kayttovesiTilavuus: '',
    kayttovesiLampotilaAsetus: '',
    kayttovesiLampotilaNykyinen: '',
    kayttovesiSahkoVastuksetEnabled: false,
    kayttovesiSahkoVastuksetSijainti: '',
    kayttovesiSahkoVastuksetMaara: '',
    kayttovesiSahkoVastukset: [],
    kayttovesiToimilaitteetOK: false,
    kayttovesiKiertoEnabled: false,
    kayttovesiKiertoPumppuTyyppi: '',
    kayttovesiKiertoPumpunValmistaja: '',
    kayttovesiKiertoPumpunMalli: '',
    kayttovesiKiertoVirtaus: '',
    kayttovesiKiertoKayntivirta: '',
    kiinteistoPiiritSisallytetaan: true,
    lampoPiireja: '',
    lampoPiirit: [],
    lampoPaisuntaAstiaTarkistettu: false,
    lampoPaisuntaAstiaKoko: '',
    lampoPaisuntaAstiaEsipaine: '',
    lampoToimilaitteetOK: false,
    lampoAutomaattinenIlmausTarkistettu: false,
    lampoMutapussiPuhdistettu: false,
    lampoSahkoKattilaVaralampitykseen: false,
    lampoSahkoKattilaTeho: '',
    lampoSahkoKattilaTyyppi: '',
    kylmaainePaetosTarkastettu: false,
    kylmaaineVuotoja: false,
    kylmaainePaineLauhdutinBar: '',
    kylmaaineKyllaestymisLampotila: '',
    kylmaaineNestePutkiLampotila: '',
    kylmaaineAlijaahdytys: '',
    mittaaKokoLaiteSahko: false,
    kokoLaiteSahkoVaiheValinta: '',
    kokoLaiteVirta1vaihe: '',
    kokoLaiteVirtaL1: '',
    kokoLaiteVirtaL2: '',
    kokoLaiteVirtaL3: '',
  };
}

export function ensureEvaporatorData(data: Partial<EvaporatorData> | undefined): EvaporatorData {
  const base = createEmptyEvaporatorData();
  if (!data) return base;
  return {
    ...base,
    ...data,
    puhaltimet: (data.puhaltimet ?? base.puhaltimet).map((f, i) => ({
      ...createEmptyEvaporatorFan(i + 1),
      ...f,
    })),
  };
}

function normalizeKayttovesiLisalammitinSijainti(
  data: Partial<MlpData>,
): MlpData['kayttovesiSahkoVastuksetSijainti'] {
  const s = data.kayttovesiSahkoVastuksetSijainti;
  if (s === 'integroitu' || s === 'ulkopuolinen') return s;
  const maara = parseInt(String(data.kayttovesiSahkoVastuksetMaara ?? ''), 10) || 0;
  const len = data.kayttovesiSahkoVastukset?.length ?? 0;
  if (maara > 0 || len > 0) return 'ulkopuolinen';
  if (data.kayttovesiSahkoVastuksetEnabled) return 'integroitu';
  return '';
}

export function ensureMlpData(data: Partial<MlpData> | null | undefined): MlpData {
  const base = createEmptyMlpData();
  if (!data) return base;
  const inferred = inferLegacyMlpFlags(data);
  const merged = { ...base, ...data, ...inferred };
  const latausNeste = merged.latausNeste ?? base.latausNeste;
  return {
    ...merged,
    latausNeste,
    latausJarjestelmanNeste: latausNeste ? '' : (data.latausJarjestelmanNeste ?? ''),
    latausGlykoliPakkaskestavyys: isMlpVesiNeste(latausNeste)
      ? ''
      : (data.latausGlykoliPakkaskestavyys ?? ''),
    kayttovesiSahkoVastuksetSijainti: normalizeKayttovesiLisalammitinSijainti(data),
    kayttovesiSahkoVastukset: (data.kayttovesiSahkoVastukset ?? []).map((v) => ({
      ...createEmptyHeatingElementData(),
      ...v,
    })),
    lampoPiirit: (data.lampoPiirit ?? []).map((p) => ({ ...createEmptyHeatingCircuitData(), ...p })),
  };
}

export function createEmptyCompressorData(): CompressorData {
  return {
    tyyppi: '',
    valmistaja: '',
    malli: '',
    oljyMaaraOikea: true,
    oljyKirkas: true,
    oljyMaaraLaatu: '',
    kompressorinVaiheValinta: '',
    virta1vaihe: '',
    virtaL1: '',
    virtaL2: '',
    virtaL3: '',
    ohjaustapa: '',
    kontaktoritTarkastettu: false,
    kontaktoriTyyppi: '',
    pehmokaynnistinTarkastettu: false,
    pehmokaynnistinTyyppi: '',
    taajuusmuuttajaTarkastettu: false,
    taajuusmuuttajaTyyppi: '',
    ohjaustapaMuu: '',
  };
}

export function createEmptyRefrigerantCircuitData(): RefrigerantCircuitData {
  const kompressori = createEmptyCompressorData();
  return {
    onKaytossa: true,
    kompressorienMaara: '1',
    imupaine: '',
    imuLampotila: '',
    korkeapaine: '',
    nestePutkiLampotila: '',
    kuumakaasuLampotila: '',
    ohjaustapa: '',
    paisuntaventtiiliTyyppi: '',
    paisuntaventtiiliMuu: '',
    paisuntaventtiiliMalli: '',
    paisuntaventtiiliValmistaja: '',
    magneettiventtiiliValmistaja: '',
    magneettiventtiiliMalli: '',
    kuivainLisatieto: '',
    kuivainValmistaja: '',
    kuivainMalli: '',
    kuivainKivienMaara: '',
    tulistus: '',
    alijäähtyminen: '',
    kompressori1: { ...kompressori },
    kompressori2: { ...kompressori },
    kompressori3: { ...kompressori },
    kompressori4: { ...kompressori },
    kompressori5: { ...kompressori },
    kompressori6: { ...kompressori },
  };
}

export function ensureRefrigerantCircuitData(
  data: Partial<RefrigerantCircuitData> | null | undefined,
): RefrigerantCircuitData {
  const base = createEmptyRefrigerantCircuitData();
  if (!data) return base;
  return {
    ...base,
    ...data,
    kompressori1: { ...base.kompressori1, ...data.kompressori1 },
    kompressori2: { ...base.kompressori2, ...data.kompressori2 },
    kompressori3: { ...base.kompressori3, ...data.kompressori3 },
    kompressori4: { ...base.kompressori4, ...data.kompressori4 },
    kompressori5: { ...base.kompressori5, ...data.kompressori5 },
    kompressori6: { ...base.kompressori6, ...data.kompressori6 },
  };
}

export function normalizeHuoltoReportData(data: Partial<HuoltoReportData>): HuoltoReportData {
  const legacy = applyLegacyHuoltoFields(data as Partial<HuoltoReportData> & Record<string, unknown>);
  const base = createEmptyHuoltoReportData();
  const merged = { ...base, ...legacy };
  const sisMaara = merged.sisayksikkoMaara ?? 1;
  const kylmaaineTyyppi = resolveKylmaaineTyyppi(merged.kylmaaineTyyppi, merged.kylmaaineLaatu);
  return {
    ...merged,
    kylmaaineTyyppi,
    kylmaaineLaatu: '',
    kylmaainePiiri1: stripMagnetValveFromCircuit(
      merged.laiteTyyppi,
      ensureRefrigerantCircuitData(legacy.kylmaainePiiri1),
    ),
    kylmaainePiiri2: legacy.kylmaainePiiri2
      ? stripMagnetValveFromCircuit(merged.laiteTyyppi, ensureRefrigerantCircuitData(legacy.kylmaainePiiri2))
      : null,
    kylmaainePiiri3: legacy.kylmaainePiiri3
      ? stripMagnetValveFromCircuit(merged.laiteTyyppi, ensureRefrigerantCircuitData(legacy.kylmaainePiiri3))
      : null,
    evaporatorData: (legacy.evaporatorData ?? base.evaporatorData).map((ev) =>
      normalizeEvaporatorForDevice(ensureEvaporatorData(ev), merged.laiteTyyppi),
    ),
    evaporatorSamaKuinEnsimmainen: legacy.evaporatorSamaKuinEnsimmainen ?? base.evaporatorSamaKuinEnsimmainen,
    condenserData: (legacy.condenserData ?? base.condenserData).map((c) => ensureCondenserData(c)),
    nestelauhduttimetVj: (Array.isArray(legacy.nestelauhduttimetVj)
      ? legacy.nestelauhduttimetVj
      : base.nestelauhduttimetVj
    ).map((u) => ensureNestelauhdutinUnit(u)),
    konvektoriRows: (legacy.konvektoriRows ?? base.konvektoriRows).map((r) => ensureKonvektoriRow(r)),
    mlpData: legacy.mlpData ? ensureMlpData(legacy.mlpData) : null,
    tiiveyskoeData: ensureTiiveyskoeData(legacy.tiiveyskoeData),
    tyhjiointiData: ensureTyhjiointiData(legacy.tyhjiointiData),
    huomiotLiitteet: (legacy.huomiotLiitteet ?? base.huomiotLiitteet)?.map((a) => ensureHuomiotLiite(a)),
    sisayksikkoMaara: sisMaara,
    sisayksikkoData: padArray(
      (legacy.sisayksikkoData ?? base.sisayksikkoData).map((s) => ensureSisayksikkoData(s)),
      sisMaara,
      createEmptySisayksikkoData,
    ),
    sisaSamaKuinEnsimmainen: padBoolArray(legacy.sisaSamaKuinEnsimmainen ?? base.sisaSamaKuinEnsimmainen, sisMaara),
    mittausSisayksikot: padArray(
      (legacy.mittausSisayksikot ?? base.mittausSisayksikot).map((m) => ensureMittausSisayksikkoData(m)),
      sisMaara,
      createEmptyMittausSisayksikkoData,
    ),
    mittausSamaKuinEnsimmainen: padBoolArray(
      legacy.mittausSamaKuinEnsimmainen ?? base.mittausSamaKuinEnsimmainen,
      sisMaara,
    ),
    lauhdutuspiiriData: isChillerLikeDevice(merged.laiteTyyppi)
      ? mergeLauhdutuspiiriData(legacy)
      : ensureLauhdutuspiiriData(legacy.lauhdutuspiiriData),
    jaahdytysvesiData: isChillerLikeDevice(merged.laiteTyyppi)
      ? mergeChillerCoolingCircuit(
          mapLegacyMlpKeruupiiriToJaahdytysvesi(legacy.mlpData, legacy.jaahdytysvesiData),
          legacy.hoyrystinPiiriData,
        )
      : ensureNestepiiriData({
          ...createEmptyJaahdytysvesiData(),
          ...(legacy.jaahdytysvesiData ?? {}),
        }),
    hoyrystinPiiriData: isChillerLikeDevice(merged.laiteTyyppi)
      ? createEmptyNestepiiriData()
      : ensureNestepiiriData({
          ...createEmptyNestepiiriData(),
          ...(legacy.hoyrystinPiiriData ?? {}),
        }),
    vjOhjausData: ensureVjOhjausData(legacy.vjOhjausData),
    vapaajahdytysData: { ...createEmptyVapaajahdytysData(), ...(legacy.vapaajahdytysData ?? {}) },
    lauhdutinTyyppiLaite:
      legacy.lauhdutinTyyppiLaite ??
      (isChillerLikeDevice(merged.laiteTyyppi)
        ? defaultCondenserTypeForDevice(merged.laiteTyyppi)
        : ''),
    vjNestelauhdutusJaettu: legacy.vjNestelauhdutusJaettu ?? base.vjNestelauhdutusJaettu,
    vapaajahdytysKaytossa: legacy.vapaajahdytysKaytossa ?? false,
    huoltoReportDocumentKind:
      merged.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto',
    selectedModules: (() => {
      const inferred = inferModulesFromLegacyData(legacy);
      const manualModules = mergeLegacySelectedModules(
        merged.laiteTyyppi,
        legacy.selectedModules as Partial<Record<ModuleKey, boolean>> | undefined,
        inferred,
      );
      if (!merged.laiteTyyppi) {
        return { ...base.selectedModules, ...manualModules } as HuoltoReportData['selectedModules'];
      }
      if (usesManualModuleMenu(merged.laiteTyyppi)) {
        return resolveAutoModules({
          laiteTyyppi: merged.laiteTyyppi,
          manualModules: { ...base.selectedModules, ...manualModules },
        }) as HuoltoReportData['selectedModules'];
      }
      return resolveAutoModules({
        laiteTyyppi: merged.laiteTyyppi,
        lauhdutinTyyppiLaite:
          legacy.lauhdutinTyyppiLaite ??
          (isChillerLikeDevice(merged.laiteTyyppi)
            ? defaultCondenserTypeForDevice(merged.laiteTyyppi)
            : ''),
        vapaajahdytysKaytossa: legacy.vapaajahdytysKaytossa ?? false,
        manualModules: { ...base.selectedModules, ...manualModules },
      }) as HuoltoReportData['selectedModules'];
    })(),
  };
}

function padArray<T>(arr: T[], length: number, create: () => T): T[] {
  const out = [...arr];
  while (out.length < length) out.push(create());
  return out.slice(0, length);
}

function padBoolArray(arr: boolean[], length: number): boolean[] {
  const out = [...arr];
  while (out.length < length) out.push(false);
  if (out.length > 0) out[0] = false;
  return out.slice(0, length);
}

export function emptySelectedModules(): Record<ModuleKey, boolean> {
  return {
    kylmaainePiiri: false,
    hoyrystin: false,
    lauhdutin: false,
    mlpPiirit: false,
    konvektorit: false,
    ulkoyksikko: false,
    sisayksikko: false,
    mittaukset: false,
    vedenjajahdytyskone: false,
    nestelauhduttimet: false,
    vapaajahdytys: false,
    tiiveyskoe: false,
    tyhjiointi: false,
  };
}

export function createEmptyHuoltoReportData(): HuoltoReportData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    asiakas: '',
    osoite: '',
    laiteTyyppi: '',
    selectedModules: emptySelectedModules(),
    laiteValmistaja: '',
    laiteMalli: '',
    laiteTunnus: '',
    laiteSarjanumero: '',
    laiteSijainti: '',
    laiteKayttotarkoitus: '',
    kylmaaineTyyppi: '',
    kylmaaineLaatu: '',
    kylmaainePiireja: '1',
    kylmaaineValmistajaMaara: '',
    kylmaaineLisattyMaara: '',
    kylmaainePutkimatka: '',
    kylmaaineMaaraPiiri1: '',
    kylmaaineMaaraPiiri2: '',
    kylmaaineMaaraPiiri3: '',
    kylmaaineMaaraPiiri4: '',
    kylmaaineMaaraYhteensa: '',
    kylmaaineCO2Ekv: '',
    hoyrystimienMaara: '',
    hoyrystinTyyppi: '',
    sulatusKaytossa: false,
    sulatusTapa: '',
    kylmaainePiiri1: createEmptyRefrigerantCircuitData(),
    kylmaainePiiri2: null,
    kylmaainePiiri3: null,
    evaporatorData: [createEmptyEvaporatorData()],
    evaporatorSamaKuinEnsimmainen: [false],
    condenserData: [createEmptyCondenserData()],
    lauhdutinTyyppiLaite: '',
    vjNestelauhdutusJaettu: true,
    hoyrystinYhteinenPiireissa: true,
    vapaajahdytysKaytossa: false,
    vapaajahdytysData: createEmptyVapaajahdytysData(),
    jaahdytysvesiData: createEmptyJaahdytysvesiData(),
    lauhdutuspiiriData: createEmptyLauhdutuspiiriData(),
    hoyrystinPiiriData: createEmptyNestepiiriData(),
    vjOhjausData: createEmptyVjOhjausData(),
    nestelauhduttimetVj: [],
    konvektoriRows: [],
    mlpData: null,
    tiiveyskoeData: createEmptyTiiveyskoeData(),
    tyhjiointiData: createEmptyTyhjiointiData(),
    huomiot: '',
    huomiotLuonne: 'kommentti',
    huomiotLiitteet: [],
    ulkoyksikkoMalli: '',
    ulkoyksikkoSarjanumero: '',
    ulkoyksikkoJaahdytysTeho: '',
    ulkoyksikkoLammitysTeho: '',
    ulkoyksikkoAsennustapa: '',
    ulkoyksikkoAsennustapaMuu: '',
    ulkoyksikkoKennosPuhdas: false,
    ulkoyksikkoSulatausVedenKeraily: false,
    ulkoyksikkoSulatausVedenTarkistettu: false,
    ulkoyksikkoTurvakytkin: false,
    ulkoyksikkoSuojakotelo: false,
    sisayksikkoMaara: 1,
    sisayksikkoData: [createEmptySisayksikkoData()],
    sisaSamaKuinEnsimmainen: [false],
    mittausJaahdytysTestattu: undefined,
    mittausLammitysTestattu: undefined,
    mittausTestausLampotila: '',
    mittausUlkoLampotila: '',
    mittausSisayksikot: [createEmptyMittausSisayksikkoData()],
    mittausSamaKuinEnsimmainen: [false],
    mittausVaiheMaara: '1',
    mittausAmpeeriL1: '',
    mittausAmpeeriL2: '',
    mittausAmpeeriL3: '',
    equipmentSnapshot: null,
    huoltoSuoritettu: false,
    huoltoKylmaaineVuotoTarkastus: false,
    huoltoLaiteessaVika: false,
    huoltoSuorittajaNimi: '',
    huoltoSuorittajaTUKES: '',
    huoltoPaivamaara: today,
    huoltoReportDocumentKind: 'huolto',
    piilotaVaroitukset: false,
  };
}

export function applyDeviceTypeDefaults(
  data: HuoltoReportData,
  deviceType: string,
): HuoltoReportData {
  const condenserType =
    isChillerLikeDevice(deviceType)
      ? data.lauhdutinTyyppiLaite || defaultCondenserTypeForDevice(deviceType)
      : defaultCondenserTypeForDevice(deviceType);

  const modules = resolveAutoModules({
    laiteTyyppi: deviceType,
    lauhdutinTyyppiLaite: condenserType,
    vapaajahdytysKaytossa: data.vapaajahdytysKaytossa ?? false,
    manualModules: {
      ...data.selectedModules,
      tiiveyskoe: data.selectedModules.tiiveyskoe,
      tyhjiointi: data.selectedModules.tyhjiointi,
    },
  });

  const patch: Partial<HuoltoReportData> = {
    laiteTyyppi: deviceType,
    laiteSarjanumero: isAirSourceHeatPump(deviceType) ? '' : data.laiteSarjanumero,
    selectedModules: modules as HuoltoReportData['selectedModules'],
    lauhdutinTyyppiLaite: condenserType,
    huoltoReportDocumentKind:
      deviceType === 'lämpöpumppu' || isHeatPumpCircuitsDevice(deviceType)
        ? data.huoltoReportDocumentKind
        : 'huolto',
    condenserData: data.condenserData.map((c) => ({ ...c, tyyppi: condenserType || c.tyyppi })),
    jaahdytysvesiData: data.jaahdytysvesiData ?? createEmptyJaahdytysvesiData(),
    vapaajahdytysData: data.vapaajahdytysData ?? createEmptyVapaajahdytysData(),
  };

  if (isHeatPumpCircuitsDevice(deviceType) || isChillerLikeDevice(deviceType)) {
    patch.mlpData = ensureMlpData(data.mlpData);
  } else {
    patch.mlpData = null;
  }
  if (deviceType === 'konvektorit') {
    patch.konvektoriRows =
      data.konvektoriRows?.length ? data.konvektoriRows.map(ensureKonvektoriRow) : [createEmptyKonvektoriRow()];
  } else {
    patch.konvektoriRows = [];
  }
  if (isChillerLikeDevice(deviceType)) {
    patch.hoyrystinYhteinenPiireissa = data.hoyrystinYhteinenPiireissa ?? true;
    if (isLiquidCondenserType(condenserType)) {
      Object.assign(patch, ensureChillerLiquidCondenserData(data));
    } else {
      patch.nestelauhduttimetVj = [];
      patch.lauhdutuspiiriData = createEmptyLauhdutuspiiriData();
      patch.vjNestelauhdutusJaettu = data.vjNestelauhdutusJaettu ?? true;
    }
  } else {
    patch.nestelauhduttimetVj = [];
    patch.lauhdutuspiiriData = createEmptyLauhdutuspiiriData();
    patch.vjNestelauhdutusJaettu = false;
    patch.hoyrystinYhteinenPiireissa = false;
    patch.vapaajahdytysKaytossa = false;
  }
  if (deviceType === 'lämpöpumppu' || deviceType === 'vesiilmalampopumppu') {
    const maara = data.sisayksikkoMaara > 0 ? data.sisayksikkoMaara : 1;
    if (deviceType === 'lämpöpumppu') {
      patch.sisayksikkoMaara = maara;
      patch.sisayksikkoData = padArray(
        data.sisayksikkoData?.length ? data.sisayksikkoData.map(ensureSisayksikkoData) : [createEmptySisayksikkoData()],
        maara,
        createEmptySisayksikkoData,
      );
      patch.sisaSamaKuinEnsimmainen = padBoolArray(data.sisaSamaKuinEnsimmainen ?? [false], maara);
      patch.mittausSisayksikot = padArray(
        data.mittausSisayksikot?.length
          ? data.mittausSisayksikot.map(ensureMittausSisayksikkoData)
          : [createEmptyMittausSisayksikkoData()],
        maara,
        createEmptyMittausSisayksikkoData,
      );
      patch.mittausSamaKuinEnsimmainen = padBoolArray(data.mittausSamaKuinEnsimmainen ?? [false], maara);
    }
  }

  return { ...data, ...patch };
}

function isAirSourceHeatPump(deviceType: string) {
  return deviceType === 'lämpöpumppu';
}

/** Lyhyt kuvaus listanimeä varten (laite / tyyppi), sama idea kuin työraportin kuvaus. */
export function maintenanceReportTitleSnippet(data: HuoltoReportData): string {
  const deviceTypeLabel = deviceTypes.find((d) => d.value === data.laiteTyyppi)?.label;
  return [
    data.laiteTunnus?.trim(),
    data.laiteMalli?.trim(),
    deviceTypeLabel,
    data.laiteKayttotarkoitus?.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildMaintenanceReportTitleFromData(
  customerName: string | undefined | null,
  data: HuoltoReportData,
): string {
  return buildMaintenanceReportTitle(customerName, maintenanceReportTitleSnippet(data));
}

export function resolveMaintenanceReportTitle(
  storedTitle: string | null | undefined,
  data: HuoltoReportData,
  customerName?: string | null,
): string {
  const trimmed = storedTitle?.trim();
  if (trimmed) return trimmed;
  const customer = customerName ?? (data.asiakas?.trim() || null);
  return buildMaintenanceReportTitleFromData(customer, data);
}

/** @deprecated Prefer resolveMaintenanceReportTitle with DB title when available. */
export function maintenanceReportListTitle(data: HuoltoReportData): string {
  return buildMaintenanceReportTitleFromData(data.asiakas?.trim() || null, data);
}

export function mergeHuoltoReportData(
  base: HuoltoReportData,
  patch: Partial<HuoltoReportData>,
): HuoltoReportData {
  const merged = { ...base, ...patch };
  if (patch.selectedModules) {
    merged.selectedModules = { ...base.selectedModules, ...patch.selectedModules };
  }
  return merged;
}
