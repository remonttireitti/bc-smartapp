/**
 * Ilmalämpöpumppujen huolto: yksi pöytäkirja, useita laitteita (kuten konvektorit).
 *
 * Laite 1 = raportin omat (litteät) kentät, joten vanhat raportit ovat sellaisenaan yhden laitteen
 * pöytäkirjoja ja muu logiikka (raportointi, kylmäaine, laitekortti) toimii laitteelle 1.
 * Laitteet 2…N tallennetaan data.ilpLisaLaitteet-listaan (vain laitekohtaiset kentät).
 * Tiiveyskoe ja tyhjiöinti ovat laitekohtaisia: laite 1 = selectedModules + tiiveyskoeData/tyhjiointiData,
 * laitteet 2…N = oma tiiveyskoeData/tyhjiointiData + ilpLaiteTiiveyskoeKaytossa/ilpLaiteTyhjiointiKaytossa.
 */
import {
  createEmptyHuoltoReportData,
  createEmptyMittausSisayksikkoData,
  createEmptySisayksikkoData,
  ensureMittausSisayksikkoData,
  ensureSisayksikkoData,
} from './defaults';
import { usesRefrigerantServiceExtras } from './deviceModuleLogic';
import {
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import { sisayksikkoTarkastusSummary } from './sisayksikkoTarkastus';
import type { HuomioLuonne, HuoltoReportData } from './types';

export const ILP_LISALAITTEET_KEY = 'ilpLisaLaitteet';

/** Laitekohtainen tieto (laitteet 2…N). */
export type IlpLaiteData = Partial<HuoltoReportData> & {
  id: string;
  /** Laitekohtainen huomio (yhdistetty käynti: vanhan raportin huomiot). */
  ilpLaiteHuomiot?: string;
  ilpLaiteHuomiotLuonne?: HuomioLuonne;
  ilpLaiteTiiveyskoeKaytossa?: boolean;
  ilpLaiteTyhjiointiKaytossa?: boolean;
};

export type IlpDeviceTestKey = 'tiiveyskoe' | 'tyhjiointi';

const TEST_FLAG_KEYS: Record<IlpDeviceTestKey, 'ilpLaiteTiiveyskoeKaytossa' | 'ilpLaiteTyhjiointiKaytossa'> = {
  tiiveyskoe: 'ilpLaiteTiiveyskoeKaytossa',
  tyhjiointi: 'ilpLaiteTyhjiointiKaytossa',
};

const DEVICE_IDENTITY_KEYS = new Set([
  'laiteTunnus',
  'laiteSijainti',
  'laiteValmistaja',
  'laiteMalli',
  'laiteSarjanumero',
  'tiiveyskoeData',
  'tyhjiointiData',
]);

const DEVICE_KEY_PREFIXES = ['ulkoyksikko', 'sisayksikko', 'sisaSama', 'mittaus', 'ilpLaite'];

export function isIlpMultiDeviceType(laiteTyyppi: string | null | undefined): boolean {
  return laiteTyyppi === 'lämpöpumppu';
}

/** Yhteinen tiiveyskoe/tyhjiöinti-osio (ei ILP:llä: kokeet ovat laitekohtaisia). */
export function usesSharedServiceTests(laiteTyyppi: string | null | undefined): boolean {
  return usesRefrigerantServiceExtras(laiteTyyppi ?? '') && !isIlpMultiDeviceType(laiteTyyppi);
}

/** Kuuluuko kenttä yksittäiselle ilmalämpöpumpulle (eikä koko pöytäkirjalle). */
export function isIlpDeviceKey(key: string): boolean {
  if (DEVICE_IDENTITY_KEYS.has(key)) return true;
  if (key.startsWith('kylmaaine')) return !key.startsWith('kylmaainePiiri');
  return DEVICE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function newIlpLaiteId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `ilp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Laitekohtaiset kentät tyhjästä raportista (uusi laite). */
function emptyIlpDeviceFields(): Partial<HuoltoReportData> {
  return pickIlpDeviceFields(createEmptyHuoltoReportData());
}

export function pickIlpDeviceFields(data: Partial<HuoltoReportData>): Partial<HuoltoReportData> {
  const out: Partial<HuoltoReportData> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isIlpDeviceKey(key)) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** Pöytäkirjan yhteiset kentät ilman laitteen 1 tietoja. */
function omitIlpDeviceFields(data: HuoltoReportData): HuoltoReportData {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isIlpDeviceKey(key)) out[key] = value;
  }
  return out as HuoltoReportData;
}

export function ilpLisaLaitteet(form: Partial<HuoltoReportData>): IlpLaiteData[] {
  const raw = (form as Record<string, unknown>)[ILP_LISALAITTEET_KEY];
  if (!isIlpMultiDeviceType(form.laiteTyyppi) || !Array.isArray(raw)) return [];
  return raw.filter((item): item is IlpLaiteData => !!item && typeof item === 'object');
}

export function ilpDeviceCount(form: Partial<HuoltoReportData>): number {
  return 1 + ilpLisaLaitteet(form).length;
}

/** Sisäyksikkölistojen pituus vastaamaan sisayksikkoMaara-arvoa (kuten normalize). */
function padDeviceArrays(view: HuoltoReportData): HuoltoReportData {
  const maara = view.sisayksikkoMaara > 0 ? view.sisayksikkoMaara : 1;
  const pad = <T,>(arr: T[] | undefined, create: () => T, ensure: (v: T) => T): T[] => {
    const out = (Array.isArray(arr) ? arr : []).map(ensure);
    while (out.length < maara) out.push(create());
    return out.slice(0, maara);
  };
  const padBool = (arr: boolean[] | undefined): boolean[] => {
    const out = Array.isArray(arr) ? [...arr] : [];
    while (out.length < maara) out.push(false);
    if (out.length > 0) out[0] = false;
    return out.slice(0, maara);
  };
  return {
    ...view,
    sisayksikkoMaara: maara,
    sisayksikkoData: pad(view.sisayksikkoData, createEmptySisayksikkoData, ensureSisayksikkoData),
    sisaSamaKuinEnsimmainen: padBool(view.sisaSamaKuinEnsimmainen),
    mittausSisayksikot: pad(view.mittausSisayksikot, createEmptyMittausSisayksikkoData, ensureMittausSisayksikkoData),
    mittausSamaKuinEnsimmainen: padBool(view.mittausSamaKuinEnsimmainen),
  };
}

/** Laitteen näkymä: koko pöytäkirjan tiedot + laitteen omat kentät. */
export function ilpDeviceView(form: HuoltoReportData, index: number): HuoltoReportData {
  if (index <= 0) return form;
  const extra = ilpLisaLaitteet(form)[index - 1];
  if (!extra) return form;
  const { id: _id, ...fields } = extra;
  const empty = emptyIlpDeviceFields();
  const own = pickIlpDeviceFields(fields);
  return padDeviceArrays({
    ...omitIlpDeviceFields(form),
    ...empty,
    ...own,
    tiiveyskoeData: { ...empty.tiiveyskoeData!, ...(own.tiiveyskoeData ?? {}) },
    tyhjiointiData: { ...empty.tyhjiointiData!, ...(own.tyhjiointiData ?? {}) },
    selectedModules: {
      ...form.selectedModules,
      tiiveyskoe: extra.ilpLaiteTiiveyskoeKaytossa === true,
      tyhjiointi: extra.ilpLaiteTyhjiointiKaytossa === true,
    },
  });
}

/** Onko laitteella tiiveyskoe / tyhjiöinti (näkymästä: laite 1 = selectedModules). */
export function ilpDeviceTestEnabled(view: HuoltoReportData, key: IlpDeviceTestKey): boolean {
  return view.selectedModules?.[key] === true;
}

/** Laitteen tiiveyskokeen / tyhjiöinnin päälle/pois. */
export function setIlpDeviceTestEnabled(
  form: HuoltoReportData,
  index: number,
  key: IlpDeviceTestKey,
  enabled: boolean,
): Partial<HuoltoReportData> {
  if (index <= 0) return { selectedModules: { ...form.selectedModules, [key]: enabled } };
  return patchIlpDevice(form, index, { [TEST_FLAG_KEYS[key]]: enabled });
}

export function ilpDeviceViews(form: HuoltoReportData): HuoltoReportData[] {
  if (!isIlpMultiDeviceType(form.laiteTyyppi)) return [form];
  return Array.from({ length: ilpDeviceCount(form) }, (_, index) => ilpDeviceView(form, index));
}

/** Muutos laitteeseen → muutos pöytäkirjaan. Laite 1 = litteät kentät. */
export function patchIlpDevice(
  form: HuoltoReportData,
  index: number,
  patch: Partial<HuoltoReportData>,
): Partial<HuoltoReportData> {
  if (index <= 0) return patch;
  const shared: Partial<HuoltoReportData> = {};
  const device: Partial<HuoltoReportData> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'selectedModules' && value && typeof value === 'object') {
      // Laitteen näkymän selectedModules sisältää laitteen omat koeliput.
      const modules = value as HuoltoReportData['selectedModules'];
      for (const testKey of ['tiiveyskoe', 'tyhjiointi'] as const) {
        if (testKey in modules) device[TEST_FLAG_KEYS[testKey]] = modules[testKey] === true;
      }
      shared.selectedModules = {
        ...modules,
        tiiveyskoe: form.selectedModules.tiiveyskoe,
        tyhjiointi: form.selectedModules.tyhjiointi,
      };
      continue;
    }
    (isIlpDeviceKey(key) ? device : shared)[key] = value;
  }
  if (Object.keys(device).length === 0) return shared;
  const extras = ilpLisaLaitteet(form).map((extra, i) => (i === index - 1 ? { ...extra, ...device } : extra));
  return { ...shared, [ILP_LISALAITTEET_KEY]: extras };
}

/** Uusi laite. Kopioitaessa mukaan tulevat malli- ja kylmäainetiedot, ei sarjanumeroita eikä tarkastuksia. */
export function addIlpDevice(form: HuoltoReportData, copyFromIndex?: number): Partial<HuoltoReportData> {
  const fields = emptyIlpDeviceFields();
  if (copyFromIndex != null) {
    const source = ilpDeviceView(form, copyFromIndex);
    Object.assign(fields, {
      laiteValmistaja: source.laiteValmistaja,
      laiteMalli: source.laiteMalli,
      ulkoyksikkoMalli: source.ulkoyksikkoMalli,
      ulkoyksikkoJaahdytysTeho: source.ulkoyksikkoJaahdytysTeho,
      ulkoyksikkoLammitysTeho: source.ulkoyksikkoLammitysTeho,
      ulkoyksikkoAsennustapa: source.ulkoyksikkoAsennustapa,
      ulkoyksikkoAsennustapaMuu: source.ulkoyksikkoAsennustapaMuu,
      kylmaaineTyyppi: source.kylmaaineTyyppi,
      kylmaaineValmistajaMaara: source.kylmaaineValmistajaMaara,
      sisayksikkoMaara: source.sisayksikkoMaara,
      sisayksikkoData: (source.sisayksikkoData ?? []).map((unit) => ({
        ...createEmptySisayksikkoData(),
        tyyppi: unit.tyyppi,
        malli: unit.malli,
        kondenssivesi: unit.kondenssivesi,
        pumppuMalli: unit.pumppuMalli,
      })),
    });
  }
  const device: IlpLaiteData = { ...fields, id: newIlpLaiteId() };
  return { [ILP_LISALAITTEET_KEY]: [...ilpLisaLaitteet(form), device] };
}

/** Poisto. Laitteen 1 poistuessa laite 2 siirtyy raportin omiin kenttiin. */
export function removeIlpDevice(form: HuoltoReportData, index: number): Partial<HuoltoReportData> {
  const extras = ilpLisaLaitteet(form);
  if (extras.length === 0) return {};
  if (index <= 0) {
    const { id: _id, ...next } = extras[0];
    const cleared: Record<string, unknown> = {};
    for (const key of Object.keys(form)) {
      if (isIlpDeviceKey(key)) cleared[key] = undefined;
    }
    return {
      ...cleared,
      ...emptyIlpDeviceFields(),
      ...pickIlpDeviceFields(next),
      ilpLaiteTiiveyskoeKaytossa: undefined,
      ilpLaiteTyhjiointiKaytossa: undefined,
      selectedModules: {
        ...form.selectedModules,
        tiiveyskoe: next.ilpLaiteTiiveyskoeKaytossa === true,
        tyhjiointi: next.ilpLaiteTyhjiointiKaytossa === true,
      },
      [ILP_LISALAITTEET_KEY]: extras.slice(1),
    };
  }
  return { [ILP_LISALAITTEET_KEY]: extras.filter((_, i) => i !== index - 1) };
}

export function ilpDeviceLabel(view: HuoltoReportData, index: number): string {
  return (
    view.laiteTunnus?.trim()
    || view.laiteSijainti?.trim()
    || [view.laiteValmistaja, view.ulkoyksikkoMalli || view.laiteMalli].map((s) => s?.trim()).filter(Boolean).join(' ')
    || `Laite ${index + 1}`
  );
}

export type IlpDeviceState = 'incomplete' | 'ok' | 'faulty';

function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

/**
 * Ulkoyksikön tarkastustila. Vanhoissa raporteissa ei ole erillistä tilaa: rastit
 * (turvakytkin/suojakotelo = varuste olemassa) eivät tarkoita vikaa, joten rasti → ok, muuten kesken.
 */
export function ilpUlkoyksikkoStatus(view: HuoltoReportData): HuoltoInspectionStatus {
  const explicit = normalizeHuoltoInspectionStatus(view.ulkoyksikkoTarkastusTila);
  if (explicit !== null) return explicit;
  const anyCheck = view.ulkoyksikkoKennosPuhdas || view.ulkoyksikkoTurvakytkin || view.ulkoyksikkoSuojakotelo
    || (view.ulkoyksikkoSulatausVedenKeraily && view.ulkoyksikkoSulatausVedenTarkistettu);
  return anyCheck ? 'ok' : null;
}

/** Laitteen tila: vika > kesken > ok (ulkoyksikkö + sisäyksiköt). */
export function ilpDeviceState(view: HuoltoReportData): IlpDeviceState {
  const ulko = ilpUlkoyksikkoStatus(view);
  const count = view.sisayksikkoMaara > 0 ? view.sisayksikkoMaara : 1;
  const units = (view.sisayksikkoData ?? []).slice(0, count);
  const unitSummaries = units.map((unit) => sisayksikkoTarkastusSummary(unit));
  const tests = ilpDeviceTestStatuses(view);
  const faulty =
    ulko === 'faulty'
    || units.some((unit) => unit.huomioTyyppi === 'vika')
    || unitSummaries.some((s) => s.anyFaulty)
    || view.ilpLaiteHuomiotLuonne === 'vika'
    || tests.some((t) => t === 'faulty');
  if (faulty) return 'faulty';
  const identity = hasText(view.ulkoyksikkoMalli) || hasText(view.ulkoyksikkoSarjanumero) || hasText(view.laiteTunnus);
  if (
    !identity
    || ulko === null
    || unitSummaries.length === 0
    || unitSummaries.some((s) => !s.complete)
    || tests.some((t) => t === null)
  ) {
    return 'incomplete';
  }
  return 'ok';
}

export function ilpDeviceStateLabel(view: HuoltoReportData): { text: string; className: string } {
  const state = ilpDeviceState(view);
  if (state === 'faulty') return { text: 'Vika', className: 'konvektori-status konvektori-status--vika' };
  if (state === 'ok') return { text: 'OK', className: 'konvektori-status konvektori-status--ok' };
  return { text: 'Kesken', className: 'konvektori-status konvektori-status--pending' };
}

export function ilpDevicesCompletion(form: HuoltoReportData): 'ok' | 'attention' | 'incomplete' {
  const states = ilpDeviceViews(form).map(ilpDeviceState);
  if (states.some((s) => s === 'incomplete')) return 'incomplete';
  if (states.some((s) => s === 'faulty')) return 'attention';
  return 'ok';
}


/** Käytössä olevien kokeiden tila: ok / faulty (hylätty) / null (kesken). */
export function ilpDeviceTestStatuses(view: HuoltoReportData): HuoltoInspectionStatus[] {
  const out: HuoltoInspectionStatus[] = [];
  if (ilpDeviceTestEnabled(view, 'tiiveyskoe')) {
    const tk = view.tiiveyskoeData;
    out.push(tk?.tulos ? (tk.tulos === 'hyvaksytty' ? 'ok' : 'faulty') : hasText(tk?.testipaineBar) ? 'ok' : null);
  }
  if (ilpDeviceTestEnabled(view, 'tyhjiointi')) {
    const ty = view.tyhjiointiData;
    out.push(ty?.tulos ? (ty.tulos === 'hyvaksytty' ? 'ok' : 'faulty') : hasText(ty?.loppupaineArvo) ? 'ok' : null);
  }
  return out;
}

/** Valokuvan tunniste lisälaitteelle (tallennuspolun tiedostonimen etuliite). */
export function ilpDevicePhotoTag(form: HuoltoReportData, index: number): string | undefined {
  if (index <= 0) return undefined;
  const id = ilpLisaLaitteet(form)[index - 1]?.id;
  const safe = String(id ?? '').replace(/[^A-Za-z0-9-]/g, '');
  return safe ? `ilp-${safe}` : undefined;
}

function compareDeviceLabels(a: string, b: string): number {
  return a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' });
}

/**
 * Vanhat raportit (yksi laite / raportti): saman käynnin raportit yhdeksi pöytäkirjaksi.
 * Laitteet tunnuksen mukaan järjestyksessä; kunkin raportin huomiot, tiiveyskoe ja tyhjiöinti
 * kuuluvat sen laitteelle, liitteet yhteiseen listaan. Ylätunniste/asiakas/suorittaja = avattu raportti.
 */
export function mergeIlpVisitReports(base: HuoltoReportData, others: HuoltoReportData[]): HuoltoReportData {
  const sources = [base, ...others].filter((d) => isIlpMultiDeviceType(d.laiteTyyppi));
  if (sources.length <= 1) return base;
  const devices = sources
    .flatMap((source) =>
      ilpDeviceViews(source).map((view, index) => {
        const device: Partial<IlpLaiteData> = { ...pickIlpDeviceFields(view) };
        if (index === 0) {
          const huom = String(source.huomiot ?? '').trim();
          if (huom) {
            device.ilpLaiteHuomiot = huom;
            device.ilpLaiteHuomiotLuonne = source.huomiotLuonne;
          }
        }
        device.ilpLaiteTiiveyskoeKaytossa = ilpDeviceTestEnabled(view, 'tiiveyskoe');
        device.ilpLaiteTyhjiointiKaytossa = ilpDeviceTestEnabled(view, 'tyhjiointi');
        return { device, label: ilpDeviceLabel(view, index) };
      }),
    )
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => compareDeviceLabels(a.label, b.label) || a.order - b.order)
    .map((entry) => entry.device);
  const [first, ...rest] = devices;
  return {
    ...omitIlpDeviceFields(base),
    ...emptyIlpDeviceFields(),
    ...first,
    ilpLaiteTiiveyskoeKaytossa: undefined,
    ilpLaiteTyhjiointiKaytossa: undefined,
    [ILP_LISALAITTEET_KEY]: rest.map((device) => ({ ...device, id: newIlpLaiteId() })),
    selectedModules: {
      ...base.selectedModules,
      tiiveyskoe: first.ilpLaiteTiiveyskoeKaytossa === true,
      tyhjiointi: first.ilpLaiteTyhjiointiKaytossa === true,
    },
    huomiot: '',
    huomiotLuonne: 'kommentti',
    huomiotLiitteet: sources.flatMap((s) => s.huomiotLiitteet ?? []),
    huoltoSuoritettu: sources.every((s) => s.huoltoSuoritettu),
    huoltoKylmaaineVuotoTarkastus: sources.every((s) => s.huoltoKylmaaineVuotoTarkastus),
    huoltoLaiteessaVika: sources.some((s) => s.huoltoLaiteessaVika),
  };
}

export type IlpVerdict = {
  state: IlpDeviceState;
  /** Viallisten laitteiden nimet. */
  faulty: string[];
  /** Keskeneräisten laitteiden nimet. */
  incomplete: string[];
};

/**
 * Pöytäkirjan kokonaistulos laitteista: vika > kesken > ei vikaa.
 * Käsin merkitty `huoltoLaiteessaVika` voi vain lisätä vian, ei kumota sitä.
 */
export function ilpOverallVerdict(form: HuoltoReportData): IlpVerdict {
  const faulty: string[] = [];
  const incomplete: string[] = [];
  ilpDeviceViews(form).forEach((view, index) => {
    const state = ilpDeviceState(view);
    if (state === 'faulty') faulty.push(ilpDeviceLabel(view, index));
    else if (state === 'incomplete') incomplete.push(ilpDeviceLabel(view, index));
  });
  const state: IlpDeviceState =
    faulty.length > 0 || form.huoltoLaiteessaVika === true ? 'faulty' : incomplete.length > 0 ? 'incomplete' : 'ok';
  return { state, faulty, incomplete };
}

function deviceList(names: string[]): string {
  return names.length > 3 ? `${names.length} laitetta` : names.join(', ');
}

export function ilpVerdictText(verdict: IlpVerdict): string {
  if (verdict.state === 'faulty') {
    return verdict.faulty.length > 0 ? `Vika havaittu (${deviceList(verdict.faulty)})` : 'Vika havaittu';
  }
  if (verdict.state === 'incomplete') return `Kesken (${deviceList(verdict.incomplete)})`;
  return 'Ei vikaa havaittu';
}

export function ilpLaitteetSummaryRows(form: HuoltoReportData): { label: string; value: string }[] {
  const verdict = ilpOverallVerdict(form);
  const rows = [
    { label: 'Laitteita', value: `${ilpDeviceCount(form)} kpl` },
    { label: 'Tulos', value: ilpVerdictText(verdict) },
  ];
  if (verdict.state === 'faulty' && verdict.incomplete.length > 0) {
    rows.push({ label: 'Kesken', value: deviceList(verdict.incomplete) });
  }
  return rows;
}
