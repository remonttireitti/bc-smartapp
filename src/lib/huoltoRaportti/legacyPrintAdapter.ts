import type { MaintenanceReportPhotoItem } from '../maintenanceReportImages';
import { normalizeMaintenanceReportPhotos } from '../maintenanceReportImages';
import { generatePrintHTML } from './legacyPrintUtils';
import type { HuoltoReportData, HuomiotImageAttachment } from './types';
import type { MaintenancePrintMeta } from './printHtml';

function resolvePhotoUrl(
  item: MaintenanceReportPhotoItem | string | HuomiotImageAttachment,
  imageUrls?: Record<string, string>,
): string {
  if (typeof item === 'string') {
    const s = item.trim();
    if (!s) return '';
    if (s.startsWith('data:image/') || s.startsWith('http')) return s;
    return imageUrls?.[s] ?? '';
  }
  const attachmentUrl = String((item as HuomiotImageAttachment).url ?? '').trim();
  if (attachmentUrl.startsWith('data:image/') || attachmentUrl.startsWith('http')) return attachmentUrl;
  const path = String(item.storagePath ?? '').trim();
  if (path && imageUrls?.[path]) return imageUrls[path];
  if (attachmentUrl && imageUrls?.[attachmentUrl]) return imageUrls[attachmentUrl];
  return '';
}

function mapEvidencePhotos(
  items: MaintenanceReportPhotoItem[] | undefined,
  imageUrls?: Record<string, string>,
): string[] {
  return normalizeMaintenanceReportPhotos(items)
    .map((item) => resolvePhotoUrl(item, imageUrls))
    .filter(Boolean);
}

function mapHuomiotLiitteet(
  items: HuomiotImageAttachment[] | undefined,
  imageUrls?: Record<string, string>,
): HuomiotImageAttachment[] {
  return (items ?? []).map((item) => {
    const url = resolvePhotoUrl(item, imageUrls) || item.url;
    return { ...item, url };
  });
}

function isMlpDevice(data: HuoltoReportData): boolean {
  return (
    data.laiteTyyppi === 'mlp'
    || data.laiteTyyppi === 'vesiilmalampopumppu'
    || Boolean(data.selectedModules.mlpPiirit)
  );
}

function hasAirCondenser(data: HuoltoReportData): boolean {
  return data.condenserData.some(
    (c) => c?.tyyppi === 'koneseen_integroitu' || c?.tyyppi === 'erillinen_ilma',
  );
}

/** Full legacy print HTML (1:1 with old huoltoraportti app). */
export function generateLegacyMaintenanceReportHtml(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const legacy = (data.legacyCompanyInfo ?? {}) as Record<string, unknown>;
  const imageUrls = meta.imageUrls;

  return generatePrintHTML({
    isMLP: isMlpDevice(data),
    mlpData: data.mlpData,
    asiakas: data.asiakas,
    asiakasYtunnus: data.asiakasYtunnus,
    asiakasYhteyshenkilo: data.asiakasYhteyshenkilo,
    asiakasPuhelin: data.asiakasPuhelin,
    asiakasEmail: data.asiakasEmail,
    osoite: data.osoite,
    laiteTyyppi: data.laiteTyyppi,
    selectedModules: data.selectedModules,
    laiteValmistaja: data.laiteValmistaja,
    laiteMalli: data.laiteMalli,
    laiteTunnus: data.laiteTunnus,
    laiteSarjanumero: data.laiteSarjanumero,
    laiteSijainti: data.laiteSijainti,
    laiteKayttotarkoitus: data.laiteKayttotarkoitus,
    kylmaaineTyyppi: data.kylmaaineTyyppi || data.kylmaaineLaatu,
    kylmaainePiireja: data.kylmaainePiireja,
    kylmaaineMaaraPiiri1: data.kylmaaineMaaraPiiri1,
    kylmaaineMaaraPiiri2: data.kylmaaineMaaraPiiri2,
    kylmaaineMaaraPiiri3: data.kylmaaineMaaraPiiri3,
    kylmaaineMaaraPiiri4: data.kylmaaineMaaraPiiri4,
    kylmaaineMaaraYhteensa: data.kylmaaineMaaraYhteensa,
    kylmaaineCO2Ekv: data.kylmaaineCO2Ekv,
    kp1Data: data.kylmaainePiiri1,
    kp2Data: data.kylmaainePiiri2 ?? {},
    kp3Data: data.kylmaainePiiri3 ?? {},
    evaporatorData: data.evaporatorData,
    condenserData: data.condenserData,
    ulkoyksikkoMalli: data.ulkoyksikkoMalli,
    ulkoyksikkoSarjanumero: data.ulkoyksikkoSarjanumero,
    ulkoyksikkoJaahdytysTeho: data.ulkoyksikkoJaahdytysTeho,
    ulkoyksikkoLammitysTeho: data.ulkoyksikkoLammitysTeho,
    ulkoyksikkoAsennustapa: data.ulkoyksikkoAsennustapa,
    ulkoyksikkoAsennustapaMuu: data.ulkoyksikkoAsennustapaMuu,
    ulkoyksikkoKennosPuhdas: data.ulkoyksikkoKennosPuhdas,
    ulkoyksikkoKennoPuhdistustapa: data.ulkoyksikkoKennoPuhdistustapa,
    ulkoyksikkoSulatausVedenKeraily: data.ulkoyksikkoSulatausVedenKeraily,
    ulkoyksikkoSulatausVedenTarkistettu: data.ulkoyksikkoSulatausVedenTarkistettu,
    ulkoyksikkoTurvakytkin: data.ulkoyksikkoTurvakytkin,
    ulkoyksikkoSuojakotelo: data.ulkoyksikkoSuojakotelo,
    kylmaaineValmistajaMaara: data.kylmaaineValmistajaMaara,
    kylmaaineLisattyMaara: data.kylmaaineLisattyMaara,
    kylmaainePutkimatka: data.kylmaainePutkimatka,
    sisayksikkoMaara: data.sisayksikkoMaara,
    sisayksikkoData: data.sisayksikkoData,
    mittausJaahdytysTestattu: data.mittausJaahdytysTestattu,
    mittausLammitysTestattu: data.mittausLammitysTestattu,
    mittausTestausLampotila: data.mittausTestausLampotila,
    mittausUlkoLampotila: data.mittausUlkoLampotila,
    mittausSisayksikot: data.mittausSisayksikot,
    mittausVaiheMaara: data.mittausVaiheMaara,
    mittausAmpeeriL1: data.mittausAmpeeriL1,
    mittausAmpeeriL2: data.mittausAmpeeriL2,
    mittausAmpeeriL3: data.mittausAmpeeriL3,
    konvektoriRows: data.konvektoriRows,
    huomiot: data.huomiot,
    huomiotLuonne: data.huomiotLuonne,
    huomiotLiitteet: mapHuomiotLiitteet(data.huomiotLiitteet, imageUrls),
    nestelauhduttimetVj: data.nestelauhduttimetVj,
    huoltoSuorittajaNimi: data.huoltoSuorittajaNimi,
    huoltoSuorittajaTUKES: data.huoltoSuorittajaTUKES,
    huoltoPaivamaara: data.huoltoPaivamaara,
    huoltoSuoritettu: data.huoltoSuoritettu,
    huoltoKylmaaineVuotoTarkastus: data.huoltoKylmaaineVuotoTarkastus,
    huoltoLaiteessaVika: data.huoltoLaiteessaVika,
    piilotaVaroitukset: data.piilotaVaroitukset,
    hasAirCondenserSelected: hasAirCondenser(data),
    huoltoReportDocumentKind: data.huoltoReportDocumentKind,
    companyInfo: {
      name: String(legacy.name ?? meta.companyName ?? '').trim(),
      businessId: String(legacy.businessId ?? '').trim(),
      address: String(legacy.address ?? '').trim(),
      phone: String(legacy.phone ?? '').trim(),
      email: String(legacy.email ?? '').trim(),
      logoBase64: meta.logoUrl ?? '',
    },
    tiiveyskoeData: {
      ...data.tiiveyskoeData,
      todisteKuvat: mapEvidencePhotos(data.tiiveyskoeData?.todisteKuvat, imageUrls),
    },
    tyhjiointiData: {
      ...data.tyhjiointiData,
      todisteKuvat: mapEvidencePhotos(data.tyhjiointiData?.todisteKuvat, imageUrls),
    },
  });
}
