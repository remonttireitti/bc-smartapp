/** Esimerkkidata tulosteen tarkistukseen (G426 OK01, kylmäkoneikko). Ei kosketa oikeaan dataan. */
import { applyDeviceTypeDefaults, createEmptyHuoltoReportData, createEmptyCompressorData, createEmptyEvaporatorData } from '../src/lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../src/lib/huoltoRaportti/types';

export function buildG426Report(rich = false): HuoltoReportData {
  const base = applyDeviceTypeDefaults(createEmptyHuoltoReportData(), 'kylmäkoneikko');
  const d = base as unknown as Record<string, any>;
  Object.assign(d, {
    laiteTyyppi: 'kylmäkoneikko',
    asiakas: 'Messukeskus',
    osoite: 'Messuaukio 1, 00521 Helsinki',
    asiakasYtunnus: '0116322-3',
    laiteValmistaja: 'Silensys',
    laiteMalli: 'SILFH2480ZTZ',
    laiteTunnus: 'G426 OK01',
    laiteSijainti: 'Huoltotunneli',
    laiteSarjanumero: '18F27 170356 S993230202',
    laiteKayttotarkoitus: 'Keittiö pakastin h 7 EVENT',
    kylmaaineTyyppi: 'R-452A',
    kylmaaineValmistajaMaara: '4',
    kylmaaineLisattyMaara: '',
    kylmaainePiireja: '1',
    kylmaaineCO2Ekv: '8.56',
    huoltoPaivamaara: '2026-10-29',
    huoltoSuoritettu: true,
    huoltoLaiteessaVika: false,
    huoltoKylmaaineVuotoTarkastus: true,
    huoltoSuorittajaNimi: 'Enn Kotselainen',
    huoltoSuorittajaTUKES: '538/91/2015',
    legacyCompanyInfo: { name: 'Uudenmaan Kylmähuolto Oy', businessId: '1234567-8', phone: '040 123 4567', email: 'info@ukh.example' },
  });
  const kp = d.kylmaainePiiri1;
  Object.assign(kp, {
    onKaytossa: true,
    imupaine: '0.9',
    imuLampotila: '-17',
    korkeapaine: '',
    ohjaustapa: '',
    nestelasiKaytossa: true, nestelasiKuplat: 'kupliton', nestelasiKosteus: 'kuiva',
    kuivainKaytossa: true, koneikkoKuivainMalli: 'Juodettava 1/4',
  });
  Object.assign(d, { nestelasiKaytossa: true, nestelasiKuplat: 'kupliton', nestelasiKosteus: 'kuiva', kuivainKaytossa: true, koneikkoKuivainMalli: 'Juodettava 1/4' });
  Object.assign(kp.kompressori1 ?? (kp.kompressori1 = createEmptyCompressorData()), {
    valmistaja: 'Temutech',
    ohjaustapa: 'suorakaynnistys',
    kontaktoriTyyppi: 'Danfoss',
    oljyMaaraOikea: true,
    oljyKirkas: true,
    kompressorinVaiheValinta: '3',
    virtaL1: '8.2',
    virtaL2: '8.4',
    virtaL3: '8.1',
    tarkastusTila: 'ok',
  });
  const ev = d.evaporatorData[0] ?? (d.evaporatorData[0] = createEmptyEvaporatorData('kylmäkoneikko'));
  Object.assign(ev, {
    tyyppi: 'puhallin',
    huoneenTunnus: 'Keittiö pakastin h 7 EVENT',
    sulatus: 'sahko',
    sahkoJannite: '230',
    valmistaja: 'Lu-ve',
    malli: 'CSEH202BS 230V BO AL CB AL 4.0 CU',
    sarjanumero: '10173068',
    sulatusOhjaus: 'huonesäädin',
    sulatusKertojaPäivässä: '4',
    sulatusAika: '20',
    ilmaTuloLampotila: '4',
    ilmaTuloRh: '70',
    ilmaPoistoLampotila: '0',
    ilmaPoistoRh: '60',
    ilmavirtaM3h: '500',
    hoyrystymisLampotila: '0',
    magneettiventtiiliMalli: 'Danfoss',
    paisuntaventtiiliTyyppi: 'TXV',
    paisuntaventtiiliMalli: 'Danfoss',
    ohjausTyyppi: 'saadin',
    ohjausMalli: 'Danfoss optima control',
    lampotilaAsetus: '4',
    halytysYla: '10',
    halytysAla: '-5',
    tarkastusTila: 'ok',
  });
  const co = d.condenserData[0];
  Object.assign(co, {
    tyyppi: 'ilma_kone_integroitu',
    puhaltimienMaara: 1,
    puhallinOhjaus: 'nopeussäädin',
    nopeussäädinMalli: 'Danfoss',
    lauhdutusAsetus: '15',
    puhallinKaynnistysAsetus: '16',
    puhallinPysaytysAsetus: '15',
    lauhtumisLampotila: '33',
    ilmaTuloLampotila: '10',
    ilmaPoistoLampotila: '22',
    alijaahtyminen: '3',
    ilmavirtaM3h: '400',
    virtausRiittävä: true,
    tarkastusTila: 'ok',
  });
  co.puhaltimet = [{ ...(co.puhaltimet?.[0] ?? {}), id: 1, jannite: '230', vaiheValinta: '1', virtaL1: '0.5' }];
  d.kenttaModuulit = {
    ohjaukset: { koneikkoOhjaustapa: 'Imupaine', saadin: 'Danfoss KP15', imupaineAsetus: '0.2', imupaineAsetusT: '-39.2', halytykset: 'Kunnossa' },
    kylmioMittaukset: { konehuoneLampo: '10' },
  };
  if (rich) {
    d.huomiot = 'Höyrystimen sulatusvesilinja jäätynyt osittain, sulatettu paikan päällä.\nSuositus: tarkista sulatusvesilinjan lämpövastus ensi huollossa.';
    d.huomiotLuonne = 'huomio';
  }
  return base;
}

/** Muut laitetyypit pienellä datalla: tarkistaa että kaikki tulosteet rakentuvat ja näyttävät yhtenäisiltä. */
export function buildTypeReport(type: string): HuoltoReportData {
  const base = applyDeviceTypeDefaults(createEmptyHuoltoReportData(), type);
  const d = base as unknown as Record<string, any>;
  Object.assign(d, {
    laiteTyyppi: type,
    asiakas: 'As Oy Esimerkkipuisto',
    osoite: 'Puistotie 5, 00100 Helsinki',
    laiteValmistaja: 'Daikin',
    laiteMalli: 'X-100',
    laiteTunnus: 'LK1',
    laiteSijainti: 'Katto',
    laiteSarjanumero: 'SN123456',
    kylmaaineTyyppi: 'R-410A',
    kylmaaineValmistajaMaara: '2.4',
    kylmaainePiireja: '1',
    huoltoPaivamaara: '2026-10-29',
    huoltoSuoritettu: true,
    huoltoLaiteessaVika: false,
    huoltoSuorittajaNimi: 'Enn Kotselainen',
    huoltoSuorittajaTUKES: '538/91/2015',
    huomiot: 'Suodatin vaihdettu. Seuraava huolto 12 kk kuluttua.',
    legacyCompanyInfo: { name: 'Uudenmaan Kylmähuolto Oy', businessId: '1234567-8' },
  });
  if (d.kylmaainePiiri1) Object.assign(d.kylmaainePiiri1, { imupaine: '9.8', imuLampotila: '8', korkeapaine: '24.5', nestePutkiLampotila: '34' });
  if (d.mlpData) Object.assign(d.mlpData, { keruupiiriVirtaus: '1.2' });
  return base;
}
