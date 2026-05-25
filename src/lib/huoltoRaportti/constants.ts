import {
  defaultCondenserTypeForDevice,
  getManualModuleOptions,
  resolveAutoModules,
} from './deviceModuleLogic';

export const deviceTypes = [
  { value: 'vedenjäähdytyskone', label: 'Vedenjäähdytyskone' },
  { value: 'pakastin', label: 'Pakastin' },
  { value: 'vakioilmastointtikone', label: 'Vakioilmastointikone' },
  { value: 'lämpöpumppu', label: 'Ilmalämpöpumppu' },
  { value: 'kylmäkoneikko', label: 'Kylmäkoneikko' },
  { value: 'konvektorit', label: 'Konvektorit' },
  { value: 'mlp', label: 'Maalämpöpumppu' },
  { value: 'vesiilmalampopumppu', label: 'Vesi-ilmalämpöpumppu' },
  { value: 'muu', label: 'Muu laite' },
] as const;

export type DeviceTypeValue = (typeof deviceTypes)[number]['value'];

export const moduleSelectionOptions = [
  { key: 'kylmaainePiiri', label: 'Kylmäainepiiri' },
  { key: 'hoyrystin', label: 'Höyrystin' },
  { key: 'lauhdutin', label: 'Lauhdutin' },
  { key: 'mlpPiirit', label: 'MLP-piirit' },
  { key: 'konvektorit', label: 'Konvektorit' },
  { key: 'ulkoyksikko', label: 'Ulkoyksikkö' },
  { key: 'sisayksikko', label: 'Sisäyksiköt' },
  { key: 'mittaukset', label: 'Mittaukset' },
  { key: 'vedenjajahdytyskone', label: 'Jäähdytysveden piiri' },
  { key: 'nestelauhduttimet', label: 'Nestelauhduttimet' },
  { key: 'vapaajahdytys', label: 'Vapaajäähdytys' },
  { key: 'tiiveyskoe', label: 'Tiiveyskoe' },
  { key: 'tyhjiointi', label: 'Tyhjiöinti' },
] as const;

export type ModuleKey = (typeof moduleSelectionOptions)[number]['key'];

export const showHuoltoVsKayttoonottoSelector = (deviceType: string) =>
  deviceType === 'lämpöpumppu' ||
  deviceType === 'mlp' ||
  deviceType === 'vesiilmalampopumppu';

export const refrigerantTypes = [
  'R-134a',
  'R-404A',
  'R-407C',
  'R-410A',
  'R-448A',
  'R-449A',
  'R-452A',
  'R-513A',
  'R-32',
  'R-290',
  'R-600a',
  'R-717',
  'R-744',
  'R-1234yf',
  'R-1234ze',
  'R-454B',
  'R-454C',
  'R-455A',
  'R-466A',
  'R-507A',
  'R-508B',
  'R-402A',
  'R-402B',
  'R-408A',
  'R-409A',
  'R-422A',
  'R-422D',
  'R-427A',
  'R-434A',
  'R-437A',
  'R-438A',
  'R-442A',
  'R-453A',
  'R-458A',
  'R-463A',
  'R-464A',
  'R-465A',
  'R-467A',
  'R-468A',
  'R-469A',
  'R-470A',
  'R-471A',
  'R-472A',
  'R-473A',
  'R-474A',
  'R-475A',
  'R-476A',
  'R-477A',
  'R-478A',
  'R-479A',
  'R-480A',
  'Muu',
] as const;

export type ModuleOption = (typeof moduleSelectionOptions)[number];

export function getDefaultModulesForDeviceType(
  deviceType: string,
  options?: {
    lauhdutinTyyppiLaite?: import('./types').LauhdutinType | '';
    vapaajahdytysKaytossa?: boolean;
  },
): Record<ModuleKey, boolean> {
  return resolveAutoModules({
    laiteTyyppi: deviceType,
    lauhdutinTyyppiLaite: options?.lauhdutinTyyppiLaite ?? defaultCondenserTypeForDevice(deviceType),
    vapaajahdytysKaytossa: options?.vapaajahdytysKaytossa ?? false,
  });
}

export function getVisibleModuleOptions(deviceType: string): ModuleOption[] {
  return getManualModuleOptions(deviceType);
}

export const ohjaustapaOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'suorakaynnistys', label: 'Suorakäynnistys' },
  { value: 'pehmokaynnistys', label: 'Pehmokäynnistin' },
  { value: 'taajuusmuuttaja', label: 'Taajuusmuuttaja' },
  { value: 'muu', label: 'Muu' },
];

export const piiriOhjaustapaOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'mlp_saato', label: 'Maalämpöpumpun säätö' },
  { value: 'taloautomaatio', label: 'Taloautomaatio' },
  { value: 'muu', label: 'Muu' },
];

export const expansionValveTypes = [
  { value: '', label: 'Valitse...' },
  { value: 'ELEKTRONINEN', label: 'Elektroninen' },
  { value: 'MEKAANINEN', label: 'Mekaaninen' },
  { value: 'MUU', label: 'Muu' },
];

export const lampoJakotapaOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'lattialammitys', label: 'Lattialämmitys' },
  { value: 'patteriverkosto', label: 'Patteri verkosto' },
  { value: 'tuloilmalammitys', label: 'Tuloilma lämmitys' },
  { value: 'markatilalattialammitys', label: 'Märkätila lattialämmitys' },
  { value: 'muu', label: 'Muu' },
];

export const puhallinOhjausOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'nopeussäädin', label: 'Nopeussäädin' },
  { value: 'taajusmuuntaja', label: 'Taajusmuuntaja' },
  { value: 'kp_pressostaatti', label: 'KP-pressostaatti' },
  { value: 'kompressorin_yhtaaikaa', label: 'Puhallin toimii kompressorin kanssa yhtä aikaa' },
  { value: 'muu', label: 'Joku muu' },
];

export const lauhdutinTypeOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'koneseen_integroitu', label: 'Koneseen integroitu ilmalauhdutin' },
  { value: 'erillinen_ilma', label: 'Erillinen ilmalauhdutin' },
  { value: 'nestekiertoinen', label: 'Nestekiertoinen lauhdutin' },
];

export const sahkoVastusOhjaustapaOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'lampopumppu', label: 'Lämpöpumppu ohjaa' },
  { value: 'taloautomaatio', label: 'Taloautomaatio ohjaa' },
  { value: 'omatermostaatti', label: 'Sähkövastuksilla oma termostaatti' },
];

export const ulkoyksikkoAsennustapaOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'maateline', label: 'Maateline' },
  { value: 'seinateline', label: 'Seinäteline' },
  { value: 'sokkeliteline', label: 'Sokkeliteline' },
  { value: 'parveketeline', label: 'Parveketeline' },
  { value: 'muu', label: 'Muu' },
];

export const sisayksikkoTyyppiOptions = [
  { value: '', label: 'Valitse...' },
  { value: 'seina', label: 'Seinä-asenteinen' },
  { value: 'kattokasetti', label: 'Kattokasetti' },
  { value: 'konsooli', label: 'Konsooli' },
  { value: 'katto-pinta', label: 'Katto-pinta' },
  { value: 'kanavoitava', label: 'Kanavoitava' },
];

export const mlpNestOptions = [
  { value: '', label: 'Valitse...' },
  { value: '4.18', label: 'Vesi (c = 4.18 kJ/kgK)' },
  { value: '3.8', label: 'Naturet' },
  { value: '3.6', label: 'Etanoli 20%' },
  { value: '3.4', label: 'Etanoli 30%' },
  { value: '3.2', label: 'Etanoli 40%' },
  { value: '3.0', label: 'Etanoli 50%' },
  { value: '3.4', label: 'Propyleeniglykoli 20%' },
  { value: '3.2', label: 'Propyleeniglykoli 30%' },
  { value: '3.0', label: 'Propyleeniglykoli 40%' },
];
