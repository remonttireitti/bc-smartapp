import type { MaintenanceReportPhotoItem } from '../maintenanceReportImages';
import type { ModuleKey } from './constants';

export type KompressorinVaiheValinta = '' | '1' | '3';
export type PumpunSyottoValinta = '' | '230_1' | '400_3';
export type FanPhaseType = 1 | 3;
export type SahkoJanniteType = '230' | '400';

export interface CompressorData {
  tyyppi: string;
  valmistaja?: string;
  malli?: string;
  oljyMaaraOikea: boolean;
  oljyKirkas: boolean;
  oljyMaaraLaatu: string;
  kompressorinVaiheValinta?: KompressorinVaiheValinta;
  onkoKolmeVaihetta?: boolean;
  virta1vaihe: string;
  virtaL1: string;
  virtaL2: string;
  virtaL3: string;
  ohjaustapa: string;
  kontaktoritTarkastettu: boolean;
  kontaktoriTyyppi: string;
  pehmokaynnistinTarkastettu: boolean;
  pehmokaynnistinTyyppi: string;
  taajuusmuuttajaTarkastettu: boolean;
  taajuusmuuttajaTyyppi: string;
  ohjaustapaMuu: string;
}

export interface RefrigerantCircuitData {
  onKaytossa: boolean;
  kompressorienMaara: string;
  imupaine: string;
  imuLampotila: string;
  korkeapaine: string;
  nestePutkiLampotila: string;
  kuumakaasuLampotila: string;
  ohjaustapa: string;
  ohjaustapaMuu?: string;
  paisuntaventtiiliTyyppi: string;
  paisuntaventtiiliMuu?: string;
  paisuntaventtiiliMalli?: string;
  paisuntaventtiiliValmistaja?: string;
  magneettiventtiiliTestattu?: boolean;
  magneettiventtiiliValmistaja?: string;
  magneettiventtiiliMalli?: string;
  nestelasiKuiva?: boolean;
  kuivainOK?: boolean;
  kuivainLisatieto?: string;
  kuivainValmistaja?: string;
  kuivainMalli?: string;
  kuivainKivienMaara?: string;
  tulistus?: string;
  alijäähtyminen?: string;
  kompressori1: CompressorData;
  kompressori2: CompressorData;
  kompressori3: CompressorData;
  kompressori4: CompressorData;
  kompressori5: CompressorData;
  kompressori6: CompressorData;
  kompressori2SamaKuin1?: boolean;
  kompressori3SamaKuin1?: boolean;
  kompressori4SamaKuin1?: boolean;
  kompressori5SamaKuin1?: boolean;
  kompressori6SamaKuin1?: boolean;
  kompressoritSamaKuinPiiri1?: boolean;
  paisuntaventtiiliSamaKuinPiiri1?: boolean;
  magneettiventtiiliSamaKuinPiiri1?: boolean;
  kuivainSamaKuinPiiri1?: boolean;
}

export interface FanData {
  id: number;
  phase: FanPhaseType;
  vaiheValinta?: KompressorinVaiheValinta;
  virtaL1: string;
  virtaL2?: string;
  virtaL3?: string;
}

export interface CondenserFanData {
  id: number;
  phase: FanPhaseType;
  vaiheValinta?: KompressorinVaiheValinta;
  jannite?: SahkoJanniteType;
  virtaL1: string;
  virtaL2?: string;
  virtaL3?: string;
}

export type EvaporatorType = 'puhallin' | 'staatinen' | 'levy' | 'putki';
export type SulatusType = 'ilma' | 'sahko' | 'kuumakaasu';
export type SulatusOhjausType = 'huonesäädin' | 'kello' | 'muu';
export type LauhdutinType = 'koneseen_integroitu' | 'erillinen_ilma' | 'nestekiertoinen';
export type PuhallinOhjausType =
  | 'nopeussäädin'
  | 'taajusmuuntaja'
  | 'kp_pressostaatti'
  | 'kompressorin_yhtaaikaa'
  | 'muu';
export type KayttovesiLisalammitinSijainti = '' | 'integroitu' | 'ulkopuolinen';
export type TiiveyskoeTulos = '' | 'hyvaksytty' | 'hylatty';
export type TyhjiointiPaineYksikko = 'micron' | 'mbar';

export interface CondenserData {
  tyyppi?: LauhdutinType;
  lauhdutinPuhdistettu?: boolean;
  lauhdutinPuhdistusTapa?: string;
  puhaltimienMaara?: number;
  puhaltimet?: CondenserFanData[];
  puhallinOhjaus?: PuhallinOhjausType;
  puhallinOhjausMuu?: string;
  nopeussäädinMalli?: string;
  taajusmuuntajaMalli?: string;
  kpPressostaattiMalli?: string;
  talvivarustus?: boolean;
  talvivarustusTapa?: string;
  painesäätimenTarkistettu?: boolean;
  painesäätimenMalli?: string;
  virtausRiittävä?: boolean;
  virtausOngelma?: string;
}

export interface TiiveyskoeData {
  testipaineBar: string;
  kestoMin: string;
  koeAlkaaPvm: string;
  koeAlkaaKlo: string;
  testauslampotila: string;
  tulos: TiiveyskoeTulos;
  menetelma: string;
  huom: string;
  todisteKuvat: MaintenanceReportPhotoItem[];
}

export interface TyhjiointiData {
  loppupaineArvo: string;
  loppupaineYksikko: TyhjiointiPaineYksikko;
  kestoMin: string;
  koeAlkaaPvm: string;
  koeAlkaaKlo: string;
  tulos: TiiveyskoeTulos;
  kaytettyPainemittari: string;
  huom: string;
  todisteKuvat: MaintenanceReportPhotoItem[];
}

export interface EvaporatorData {
  tyyppi: EvaporatorType;
  huoneenTunnus?: string;
  valmistaja: string;
  malli: string;
  sarjanumero: string;
  sulatus: SulatusType;
  sahkoJannite?: SahkoJanniteType;
  sahkoVirtaMitattu?: boolean;
  sahkoVirtaL1?: string;
  sahkoVirtaL2?: string;
  sahkoVirtaL3?: string;
  sulatusOhjaus?: SulatusOhjausType;
  sulatusOhjausMuu?: string;
  sulatusKelloMalli?: string;
  sulatusSäädinMalli?: string;
  sulatusKertojaPäivässä?: string;
  sulatusAika?: string;
  sulatusLopetusLämpötila?: string;
  puhaltimienMaara: number;
  puhaltimet: CondenserFanData[];
}

export interface HeatingElementData {
  tunnus: string;
  teho: string;
  jannite: string;
  asetusarvo: string;
  ohjaustapa: string;
  toimintaTestattu: boolean;
}

export type HuomioLuonne = 'kommentti' | 'vika';

export interface KonvektoriRowData {
  id?: string;
  tunnus: string;
  valmistaja: string;
  malli: string;
  sarjanumero: string;
  suodatinPuhdistettu: boolean;
  kennoPuhdistettu: boolean;
  kondenssiTarkastettu: boolean;
  puhallinTarkastettu: boolean;
  venttiiliTarkastettu: boolean;
  huomio: string;
  huomioTyyppi?: HuomioLuonne;
}

export interface HuomiotImageAttachment {
  id: string;
  url: string;
  comment: string;
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  createdAt?: number;
}

export type NestelauhdutinPuhallinOhjausTapa = 'on_off' | 'erillinen_taajuus' | 'sisainen_nopeussaato';

export type NestelauhdutinOhjausLahde =
  | 'talo_automaatio'
  | 'vedenjaahdytyskone'
  | 'lampotila'
  | 'korkeapaine';

export interface NestelauhdutinUnitData {
  id: string;
  lauhdutuspiiri: LauhdutuspiiriData;
  lauhdutinPuhdistettu?: boolean;
  lauhdutinPuhdistusTapa?: string;
  valmistaja: string;
  malli: string;
  sarjanumero: string;
  puhaltimienMaara: number;
  puhallinSyotto: SahkoJanniteType;
  puhaltimienValmistaja: string;
  puhaltimienMalli: string;
  puhallinOhjausTapa: NestelauhdutinPuhallinOhjausTapa | '';
  ohjausLahde: NestelauhdutinOhjausLahde | '';
  puhallinMoottoriVirratMitattu: boolean;
  puhaltimet: CondenserFanData[];
}

export interface SisayksikkoData {
  tyyppi: string;
  malli: string;
  sarjanumero: string;
  kondenssivesi: string;
  pumppuMalli: string;
  asennettu: boolean;
  kennoPuhdas: boolean;
  eiAania: boolean;
  kondenssiTestattu: boolean;
}

export interface MittausSisayksikkoData {
  imupaineJaahdytys: string;
  korkeapaineJaahdytys: string;
  imupaineLammitys: string;
  korkeapaineLammitys: string;
  sisalampotila: string;
  paluuLampotila: string;
  puhallusLampotila: string;
  ilmanmaaraM3h: string;
}

/** Equipment registry technical snapshot (stored on equipment.huolto_technical_snapshot) */
export interface EquipmentSnapshot {
  laiteTyyppi: string;
  laiteKayttotarkoitus: string;
  kylmaaineLaatu: string;
  kylmaainePiireja: string;
  kylmaaineTyyppi?: string;
  kylmaaineValmistajaMaara?: string;
  kylmaaineLisattyMaara?: string;
  kylmaainePutkimatka?: string;
  kylmaaineMaaraPiiri1?: string;
  kylmaaineMaaraPiiri2?: string;
  kylmaaineMaaraPiiri3?: string;
  kylmaaineMaaraPiiri4?: string;
  kylmaaineMaaraYhteensa?: string;
  kylmaaineCO2Ekv?: string;
  kylmaaineGwp?: string;
  kp1Data: Record<string, unknown>;
  kp2Data: Record<string, unknown>;
  kp3Data: Record<string, unknown>;
  evaporatorData: Partial<EvaporatorData>[];
  condenserData: Partial<CondenserData>[];
  nestelauhduttimetVj?: Partial<NestelauhdutinUnitData>[];
  mlpData: Partial<MlpData> | null;
  isMLP: boolean;
  ulkoyksikko: Record<string, unknown>;
  sisayksikko: { maara: number; data: unknown[] };
  konvektorit?: { tunnus: string; valmistaja: string; malli: string; sarjanumero: string }[];
}

export type VapaajahdytysOhjaus = '' | 'kone' | 'taloautomaatio';

export interface LiquidCircuitData {
  neste: string;
  virtaus: string;
  meno: string;
  tulo: string;
  pumppuTarkastettu: boolean;
  pumppuValmistaja: string;
  pumppuMalli: string;
}

/** Nestekierron peruskentät (jäähdytysvesi, lauhdutuspiiri, höyrystinpiir). */
export interface NestepiiriData extends LiquidCircuitData {
  paisuntaAstiaTarkistettu: boolean;
  paisuntaAstiaKoko: string;
  paisuntaAstiaEsipaine: string;
  paineTarkastettu: boolean;
  paineBar: string;
  automaattinenIlmausTarkistettu: boolean;
  mutapussiPuhdistettu: boolean;
  toimilaitteetOK: boolean;
}

/** Ulkoisen nestelauhduttimen nestekierto (vedenjäähdytyskone). */
export interface LauhdutuspiiriData extends NestepiiriData {
  painesäätimenTarkistettu: boolean;
  painesäätimenMalli: string;
  virtausRiittävä: boolean;
  virtausOngelma: string;
}

export interface VapaajahdytysData extends LiquidCircuitData {
  ohjaus: VapaajahdytysOhjaus;
}

export interface JaahdytysvesiData extends NestepiiriData {}

export type VjLauhdutusOhjausLahde = '' | 'kone' | 'taloautomaatio';

/** Vedenjäähdytyskone: ohjaus / automaatio. */
export interface VjOhjausData {
  ohjausValmistaja: string;
  lauhdutusOhjausLahde: VjLauhdutusOhjausLahde;
  asetusArvot: string;
  kuvaus: string;
}

export interface HeatingCircuitData {
  jakotapa: string;
  jakotapaMuu: string;
  pumppuTarkastettu?: boolean;
  pumppuTyyppi: string;
  pumppuValmistaja?: string;
  pumppuMalli?: string;
  pumppuSyottoValinta?: PumpunSyottoValinta;
  pumppuKolmeVaihetta?: boolean;
  pumppuVirta1vaihe: string;
  pumppuVirtaL1: string;
  pumppuVirtaL2: string;
  pumppuVirtaL3: string;
  virtaus: string;
  meno: string;
  tulo: string;
  neste: string;
}

export interface MlpData {
  keruupiirinPaineTarkastettu: boolean;
  keruupiiriPaineBar: string;
  keruupiirissaMutapussiPuhdistettu: boolean;
  keruupiirinPumppuTarkastettu: boolean;
  keruupiirinEristeetKunnossa: boolean;
  keruupiirissaAutomaattinenIlmausTarkistettu: boolean;
  keruupiiriVirtaus: string;
  keruupiiriMeno: string;
  keruupiiriTulo: string;
  keruupiirinPumpunTyyppi: string;
  keruupiiriPumpunValmistaja: string;
  keruupiiriPumpunMalli: string;
  keruupiiriPumpunSyottoValinta?: PumpunSyottoValinta;
  keruupiiriPumppuKolmeVaihetta?: boolean;
  keruupiiriPumppuVirta1vaihe: string;
  keruupiiriPumppuVirtaL1: string;
  keruupiiriPumppuVirtaL2: string;
  keruupiiriPumppuVirtaL3: string;
  keruupiiriNeste: string;
  keruupiiriTehoLaskenta: string;
  keruuPaisuntaAstiaTarkistettu: boolean;
  keruuPaisuntaAstiaKoko: string;
  keruuPaisuntaAstiaEsipaine: string;
  keruuJaahdytysPiiri: boolean;
  keruuJaahdytysPiiriPumppu: boolean;
  keruuJaahdytysPumppuTyyppi: string;
  keruuJaahdytysPumpunValmistaja: string;
  keruuJaahdytysPumpunMalli: string;
  keruuJaahdytysPumpunSyottoValinta?: PumpunSyottoValinta;
  keruuJaahdytysPumppuKolmeVaihetta?: boolean;
  keruuJaahdytysPumppuVirta1vaihe: string;
  keruuJaahdytysPumppuVirtaL1: string;
  keruuJaahdytysPumppuVirtaL2: string;
  keruuJaahdytysPumppuVirtaL3: string;
  keruuJaahdytysVirtaus: string;
  keruuJaahdytysKayntivirta: string;
  keruuJaahdytysMenoLampotila: string;
  keruuJaahdytysPaluuLampotila: string;
  latausPaineTarkastettu: boolean;
  latausPaineBar: string;
  latausMutapussiPuhdistettu: boolean;
  latausPumppuTarkastettu: boolean;
  latausEristeetKunnossa: boolean;
  latausAutomaattinenIlmausTarkistettu: boolean;
  latausPumpunTyyppi: string;
  latausPumpunValmistaja: string;
  latausPumpunMalli: string;
  latausPumpunSyottoValinta?: PumpunSyottoValinta;
  latausPumppuKolmeVaihetta?: boolean;
  latausPumppuVirta1vaihe: string;
  latausPumppuVirtaL1: string;
  latausPumppuVirtaL2: string;
  latausPumppuVirtaL3: string;
  latausVirtaus: string;
  latausMeno: string;
  latausTulo: string;
  latausNeste: string;
  latausPaisuntaAstiaTarkistettu: boolean;
  latausPaisuntaAstiaKoko: string;
  latausPaisuntaAstiaEsipaine: string;
  latausTulistuspiiri: boolean;
  latausTulistuspiiriPumppu: boolean;
  latausTulistusPumppuTyyppi: string;
  latausTulistusPumpunValmistaja: string;
  latausTulistusPumpunMalli: string;
  latausTulistusPumpunSyottoValinta?: PumpunSyottoValinta;
  latausTulistusPumppuKolmeVaihetta?: boolean;
  latausTulistusPumppuVirta1vaihe: string;
  latausTulistusPumppuVirtaL1: string;
  latausTulistusPumppuVirtaL2: string;
  latausTulistusPumppuVirtaL3: string;
  latausTulistusVirtaus: string;
  latausTulistusMeno: string;
  latausTulistusTulo: string;
  latausTulistusNeste: string;
  latausJarjestelmanNeste: string;
  latausGlykoliPakkaskestavyys: string;
  kayttovesiEnabled: boolean;
  kayttovesiTilavuus: string;
  kayttovesiLampotilaAsetus: string;
  kayttovesiLampotilaNykyinen: string;
  kayttovesiSahkoVastuksetEnabled: boolean;
  kayttovesiSahkoVastuksetSijainti: KayttovesiLisalammitinSijainti;
  kayttovesiSahkoVastuksetMaara: string;
  kayttovesiSahkoVastukset: HeatingElementData[];
  kayttovesiToimilaitteetOK: boolean;
  kayttovesiKiertoEnabled: boolean;
  kayttovesiKiertoPumppuTyyppi: string;
  kayttovesiKiertoPumpunValmistaja: string;
  kayttovesiKiertoPumpunMalli: string;
  kayttovesiKiertoVirtaus: string;
  kayttovesiKiertoKayntivirta: string;
  kiinteistoPiiritSisallytetaan?: boolean;
  lampoPiireja: string;
  lampoPiirit: HeatingCircuitData[];
  lampoPaisuntaAstiaTarkistettu: boolean;
  lampoPaisuntaAstiaKoko: string;
  lampoPaisuntaAstiaEsipaine: string;
  lampoToimilaitteetOK: boolean;
  lampoAutomaattinenIlmausTarkistettu: boolean;
  lampoMutapussiPuhdistettu: boolean;
  lampoSahkoKattilaVaralampitykseen: boolean;
  lampoSahkoKattilaTeho: string;
  lampoSahkoKattilaTyyppi: string;
  kylmaainePaetosTarkastettu: boolean;
  kylmaaineVuotoja: boolean;
  kylmaainePaineLauhdutinBar: string;
  kylmaaineKyllaestymisLampotila: string;
  kylmaaineNestePutkiLampotila: string;
  kylmaaineAlijaahdytys: string;
  mittaaKokoLaiteSahko: boolean;
  kokoLaiteSahkoVaiheValinta?: KompressorinVaiheValinta;
  kokoLaiteSahkoKolmeVaihetta?: boolean;
  kokoLaiteVirta1vaihe: string;
  kokoLaiteVirtaL1: string;
  kokoLaiteVirtaL2: string;
  kokoLaiteVirtaL3: string;
}

/** Core huoltoraportti data stored in maintenance_reports.data (BC-compatible subset) */
export type HuoltoReportData = {
  asiakas: string;
  customerId?: string;
  asiakasYtunnus?: string;
  asiakasYhteyshenkilo?: string;
  asiakasPuhelin?: string;
  asiakasEmail?: string;
  osoite: string;
  laiteTyyppi: string;
  selectedModules: Record<ModuleKey, boolean> & Record<string, boolean>;
  laiteValmistaja: string;
  laiteMalli: string;
  laiteTunnus: string;
  laiteSarjanumero: string;
  laiteSijainti: string;
  laiteKayttotarkoitus: string;
  kylmaaineTyyppi: string;
  kylmaaineLaatu: string;
  kylmaainePiireja: string;
  kylmaaineValmistajaMaara: string;
  kylmaaineLisattyMaara: string;
  kylmaainePutkimatka: string;
  kylmaaineMaaraPiiri1: string;
  kylmaaineMaaraPiiri2: string;
  kylmaaineMaaraPiiri3: string;
  kylmaaineMaaraPiiri4: string;
  kylmaaineMaaraYhteensa: string;
  kylmaaineCO2Ekv: string;
  hoyrystimienMaara: string;
  hoyrystinTyyppi: string;
  sulatusKaytossa: boolean;
  sulatusTapa: string;
  kylmaainePiiri1: RefrigerantCircuitData;
  kylmaainePiiri2: RefrigerantCircuitData | null;
  kylmaainePiiri3: RefrigerantCircuitData | null;
  evaporatorData: EvaporatorData[];
  evaporatorSamaKuinEnsimmainen: boolean[];
  condenserData: CondenserData[];
  lauhdutinTyyppiLaite?: LauhdutinType | '';
  vjNestelauhdutusJaettu?: boolean;
  /** Vedenjäähdytyskone / VAK: yksi höyrystin kaikille kylmäainepiireille. */
  hoyrystinYhteinenPiireissa?: boolean;
  vapaajahdytysKaytossa?: boolean;
  vapaajahdytysData?: VapaajahdytysData;
  jaahdytysvesiData?: JaahdytysvesiData;
  /** Vedenjäähdytyskone: yhteinen nestekiertoinen lauhdutuspiiri. */
  lauhdutuspiiriData?: LauhdutuspiiriData;
  /** Vedenjäähdytyskone: höyrystimen jäähdytysnestepiiri. */
  hoyrystinPiiriData?: NestepiiriData;
  vjOhjausData?: VjOhjausData;
  nestelauhduttimetVj: NestelauhdutinUnitData[];
  konvektoriRows: KonvektoriRowData[];
  mlpData: MlpData | null;
  tiiveyskoeData: TiiveyskoeData;
  tyhjiointiData: TyhjiointiData;
  huomiot: string;
  huomiotLuonne?: HuomioLuonne;
  huomiotLiitteet?: HuomiotImageAttachment[];
  ulkoyksikkoMalli: string;
  ulkoyksikkoSarjanumero: string;
  ulkoyksikkoJaahdytysTeho: string;
  ulkoyksikkoLammitysTeho: string;
  ulkoyksikkoAsennustapa: string;
  ulkoyksikkoAsennustapaMuu: string;
  ulkoyksikkoKennosPuhdas: boolean;
  ulkoyksikkoKennoPuhdistustapa?: string;
  ulkoyksikkoSulatausVedenKeraily: boolean;
  ulkoyksikkoSulatausVedenTarkistettu: boolean;
  ulkoyksikkoTurvakytkin: boolean;
  ulkoyksikkoSuojakotelo: boolean;
  sisayksikkoMaara: number;
  sisayksikkoData: SisayksikkoData[];
  sisaSamaKuinEnsimmainen: boolean[];
  mittausJaahdytysTestattu: boolean | undefined;
  mittausLammitysTestattu: boolean | undefined;
  mittausTestausLampotila: string;
  mittausUlkoLampotila: string;
  mittausSisayksikot: MittausSisayksikkoData[];
  mittausSamaKuinEnsimmainen: boolean[];
  mittausVaiheMaara: string;
  mittausAmpeeriL1: string;
  mittausAmpeeriL2: string;
  mittausAmpeeriL3: string;
  equipmentSnapshot?: EquipmentSnapshot | null;
  huoltoSuoritettu: boolean;
  huoltoKylmaaineVuotoTarkastus: boolean;
  huoltoLaiteessaVika: boolean;
  huoltoSuorittajaNimi: string;
  huoltoSuorittajaTUKES: string;
  huoltoPaivamaara: string;
  huoltoReportDocumentKind: 'huolto' | 'kayttoonotto';
  /** Tuloste: piilota kylmäainepiirin varoitukset (vanha sovellus). */
  piilotaVaroitukset?: boolean;
  /** Vanhan tuonnin yritystiedot (tuloste). */
  legacyCompanyInfo?: Record<string, unknown>;
  [key: string]: unknown;
};
export type MaintenanceReportRow = {
  id: string;
  owner_company_id: string;
  created_by_company_id: string;
  branding_company_id: string | null;
  customer_id: string | null;
  equipment_id: string | null;
  assigned_user_id: string | null;
  status: string;
  title: string | null;
  data: HuoltoReportData;
  created_at: string;
  updated_at: string;
};
