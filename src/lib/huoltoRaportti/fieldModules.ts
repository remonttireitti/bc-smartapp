/**
 * Kokoonpanon mukaan näytettävät kenttämoduulit (ohjaukset, kostutus, kuivaus, lämmitys-/jäähdytystoiminto).
 * Arvot: form.kenttaModuulit[moduuliId][kenttaId].
 */
import { isKylmioDevice, vakCoolingOn, vakHasWaterCoil, vakHeatingOn, vjHeatingEnabled, type KenttaModuuliArvot, type LaiteKokoonpano } from './deviceKokoonpano';
import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';

export type FieldModuleId =
  | 'ohjaukset'
  | 'kylmioMittaukset'
  | 'lammitystoiminto'
  | 'mlpAktiivijaahdytys'
  | 'kostutus'
  | 'kuivaus'
  | 'vesikenno'
  | 'lammitys'
  | 'vakMittaukset'
  | 'ilmapuoli'
  | 'vakOhjaus';

type FieldExtras = {
  /** Väliotsikko, joka näytetään kun ryhmä vaihtuu. */
  section?: string;
  /** Näytetäänkö kenttä (vanha arvo näytetään aina). */
  when?: (values: Record<string, string | boolean>, form: FieldModuleForm) => boolean;
  /** Pakollisuus tilanteen mukaan (ohittaa required). */
  requiredWhen?: (values: Record<string, string | boolean>, form: FieldModuleForm) => boolean;
  /** Vain vanhojen raporttien arvo: näytetään vain jos täytetty. */
  legacy?: boolean;
  /** Lämpötilamittaus (ei asetus/hälytysraja): piilossa oletuksena, avataan "Lämpötilat mitattu" -kytkimellä. */
  measured?: boolean;
  /** Kiinteä laitetieto: tallennetaan laitekorttiin ja esitäytetään uuteen raporttiin. */
  fixed?: boolean;
};
export type FieldModuleField = FieldExtras & (
  | { id: string; label: string; type: 'text'; unit?: string; required?: boolean }
  | { id: string; label: string; type: 'select'; options: string[]; required?: boolean }
  | { id: string; label: string; type: 'textarea' }
  /** Kytkin (tallennetaan arvona 'true' / tyhjä). */
  | { id: string; label: string; type: 'toggle' }
  /** Paine (bar) ↔ höyrystymislämpötila (°C) kylmäaineen P-T-taulukosta; lämpötila tallennetaan tempId:hen. */
  | { id: string; label: string; type: 'pt'; tempId: string; required?: boolean });

export type FieldModuleDefinition = {
  id: FieldModuleId;
  title: string;
  fields: FieldModuleField[];
  isVisible: (form: FieldModuleForm) => boolean;
};

export type FieldModuleForm = {
  laiteTyyppi: string;
  laiteKokoonpano?: LaiteKokoonpano;
  lauhdutinTyyppiLaite?: string;
  vapaajahdytysKaytossa?: boolean;
  kenttaModuulit?: KenttaModuuliArvot;
  evaporatorData?: unknown[];
  kylmaainePiireja?: string;
  hoyrystimienMaara?: string;
  hoyrystimetPiireittain?: string;
};

export const HOYRYSTIN_OHJAUS_YHTEINEN = 'Yhteinen';
export const HOYRYSTIN_OHJAUS_OMA = 'Jokaisella oma';

/** Näkyvien höyrystimien määrä (sama sääntö kuin getEvaporatorCircuitCount kylmiöllä). */
function evaporatorCount(form: FieldModuleForm): number {
  const len = Array.isArray(form.evaporatorData) ? form.evaporatorData.length : 0;
  const perCircuit = String(form.hoyrystimetPiireittain ?? '').split(',').map((x) => parseInt(x.trim(), 10));
  if (isKylmioDevice(form.laiteTyyppi) && perCircuit.length > 0 && perCircuit.every((n) => Number.isFinite(n))) {
    return Math.min(10, Math.max(1, perCircuit.reduce((a, b) => a + Math.max(0, b), 0)));
  }
  const explicit = parseInt(String(form.hoyrystimienMaara ?? ''), 10);
  if (isKylmioDevice(form.laiteTyyppi) && explicit >= 1) return Math.min(10, explicit);
  if (form.laiteTyyppi === 'kylmäkoneikko') return len;
  const circuits = Math.min(3, Math.max(1, parseInt(String(form.kylmaainePiireja ?? ''), 10) || 1));
  return Math.min(len, circuits);
}

/** Kylmiö: onko höyrystimien ohjaus yhteinen (ohjaukset-vaiheessa) vai höyrystinkohtainen (höyrystimen kortilla). */
export function kylmioEvaporatorOhjausShared(form: FieldModuleForm): boolean {
  // Yksi höyrystin: ohjaus täytetään kerran höyrystimen kortilla, ei kysymystä eikä yhteisiä kenttiä.
  if (evaporatorCount(form) <= 1) return false;
  return form.kenttaModuulit?.ohjaukset?.hoyrystinOhjaus !== HOYRYSTIN_OHJAUS_OMA;
}
const sharedOhjaus = (_v: Record<string, string | boolean>, form: FieldModuleForm) => kylmioEvaporatorOhjausShared(form);

const KUNTO = ['Kunnossa', 'Vika'];
const KUNTO_EI_OLE = ['Kunnossa', 'Vika', 'Ei ole'];
/** Vika-arvo merkitsee moduulin huomioksi. */
export const FIELD_MODULE_FAULT_VALUE = 'Vika';

export const FIELD_MODULES: readonly FieldModuleDefinition[] = [
  {
    id: 'ohjaukset',
    title: 'Ohjaukset',
    isVisible: (form) => isKylmioDevice(form.laiteTyyppi),
    fields: [
      { id: 'koneikkoOhjaustapa', label: 'Ohjaustapa', type: 'select', options: ['Imupaine', 'Lämpötila', 'Muu'], section: 'Koneikko' },
      { id: 'saadin', label: 'Säädin (valmistaja / malli)', type: 'text', section: 'Koneikko' },
      { id: 'imupaineAsetus', label: 'Imupaine, asetus', type: 'pt', tempId: 'imupaineAsetusT', section: 'Koneikko', when: (v) => v.koneikkoOhjaustapa === 'Imupaine' },
      { id: 'koneikkoLampoAsetus', label: 'Lämpötila, asetus', type: 'text', unit: '°C', section: 'Koneikko', when: (v) => v.koneikkoOhjaustapa === 'Lämpötila' },
      { id: 'halytykset', label: 'Hälytysten toiminta', type: 'select', options: KUNTO, required: true, section: 'Koneikko' },
      {
        id: 'hoyrystinOhjaus', label: 'Yhteinen vai oma', type: 'select', options: [HOYRYSTIN_OHJAUS_YHTEINEN, HOYRYSTIN_OHJAUS_OMA],
        section: 'Höyrystimien ohjaus', when: (_v, form) => evaporatorCount(form) > 1, requiredWhen: (_v, form) => evaporatorCount(form) > 1,
      },
      { id: 'ohjausTyyppi', label: 'Ohjauksen tyyppi', type: 'select', options: ['Elektroninen säädin', 'Termostaatti', 'Kiinteistöautomaatio'], section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'asetusarvo', label: 'Lämpötila, asetus', type: 'text', unit: '°C', section: 'Höyrystimien ohjaus', when: sharedOhjaus, requiredWhen: sharedOhjaus },
      { id: 'halytysYla', label: 'Ylähälytysraja', type: 'text', unit: '°C', section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'halytysAla', label: 'Alahälytysraja', type: 'text', unit: '°C', section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'sulatusvali', label: 'Sulatusväli', type: 'text', unit: 'h', section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'sulatusLopetus', label: 'Sulatuksen lopetus', type: 'text', unit: '°C', section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'ovi', label: 'Ovikytkin / munakello', type: 'select', options: ['Ovikytkin', 'Munakello', 'Ei ole', 'Vika'], section: 'Höyrystimien ohjaus', when: sharedOhjaus },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'kylmioMittaukset',
    title: 'Mittaukset',
    isVisible: (form) => isKylmioDevice(form.laiteTyyppi),
    fields: [
      { id: 'tilaLampo', label: 'Tilan lämpötila', type: 'text', unit: '°C', when: sharedOhjaus, measured: true },
      { id: 'konehuoneLampo', label: 'Konehuone / ulkolämpötila', type: 'text', unit: '°C', measured: true },
      { id: 'hoyrystinIlmaSisaan', measured: true, label: 'Höyrystin, ilma sisään', type: 'text', unit: '°C', legacy: true },
      { id: 'hoyrystinIlmaUlos', measured: true, label: 'Höyrystin, ilma ulos', type: 'text', unit: '°C', legacy: true },
      { id: 'lauhdutinSisaan', measured: true, label: 'Lauhdutin, ilma/neste sisään', type: 'text', unit: '°C', legacy: true },
      { id: 'lauhdutinUlos', measured: true, label: 'Lauhdutin, ilma/neste ulos', type: 'text', unit: '°C', legacy: true },
    ],
  },
  {
    id: 'lammitystoiminto',
    title: 'Lämmitystoiminto',
    isVisible: (form) => vjHeatingEnabled(form),
    fields: [
      { id: 'asetusarvo', label: 'Lämmityksen asetusarvo', type: 'text', unit: '°C' },
      { id: 'meno', label: 'Menovesi lämmityksessä', type: 'text', unit: '°C', measured: true },
      { id: 'paluu', label: 'Paluuvesi lämmityksessä', type: 'text', unit: '°C', measured: true },
      { id: 'vaihtoventtiili', label: 'Vaihtoventtiili (4-tie)', type: 'select', options: KUNTO, required: true },
      { id: 'sulatus', label: 'Sulatus', type: 'select', options: KUNTO_EI_OLE },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'mlpAktiivijaahdytys',
    title: 'Aktiivijäähdytys',
    isVisible: (form) =>
      form.laiteTyyppi === 'mlp'
      && (form.laiteKokoonpano?.mlpJaahdytys === 'aktiivinen_vaihto'
        || form.laiteKokoonpano?.mlpJaahdytys === 'aktiivinen_erillinen'),
    fields: [
      { id: 'asetusarvo', label: 'Jäähdytyksen asetusarvo', type: 'text', unit: '°C' },
      { id: 'meno', label: 'Menovesi jäähdytyksessä', type: 'text', unit: '°C', measured: true },
      { id: 'paluu', label: 'Paluuvesi jäähdytyksessä', type: 'text', unit: '°C', measured: true },
      { id: 'vaihtoventtiilit', label: 'Vaihtoventtiilit', type: 'select', options: KUNTO, required: true },
      { id: 'kastepiste', label: 'Kastepistevahti', type: 'select', options: KUNTO_EI_OLE },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'vesikenno',
    title: 'Jäähdytysvesikenno',
    isVisible: (form) => vakHasWaterCoil(form),
    fields: [
      { id: 'neste', label: 'Neste', type: 'select', options: ['Vesi', 'Glykoli 20 %', 'Glykoli 30 %', 'Glykoli 40 %'], fixed: true },
      { id: 'meno', label: 'Menovesi', type: 'text', unit: '°C', measured: true },
      { id: 'paluu', label: 'Paluuvesi', type: 'text', unit: '°C', measured: true },
      { id: 'virtaus', label: 'Virtaus', type: 'text', unit: 'm³/h' },
      { id: 'paine', label: 'Vesipiirin paine', type: 'text', unit: 'bar' },
      { id: 'venttiili', label: 'Venttiilin ja toimilaitteen toiminta', type: 'select', options: KUNTO },
      { id: 'kennoKunto', label: 'Kennon kunto', type: 'select', options: ['Kunnossa', 'Likainen', 'Vika'] },
      { id: 'kennoPuhdistettu', label: 'Kenno puhdistettu', type: 'toggle' },
      { id: 'ilmaus', label: 'Ilmaus tehty', type: 'toggle' },
      { id: 'likasuodatin', label: 'Likasuodatin puhdistettu', type: 'toggle' },
      { id: 'vuodot', label: 'Putkisto ja liitokset (vuodot)', type: 'select', options: KUNTO },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'ilmapuoli',
    title: 'Ilmapuoli',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone',
    fields: [
      { id: 'puhallinTyyppi', label: 'Puhaltimen tyyppi', type: 'select', options: ['EC', 'AC suoraveto', 'AC hihnaveto'], fixed: true, section: 'Puhallin' },
      { id: 'puhallin', label: 'Puhaltimen toiminta', type: 'select', options: KUNTO, section: 'Puhallin' },
      { id: 'puhallinVirta', label: 'Puhaltimen virta', type: 'text', unit: 'A', section: 'Puhallin' },
      { id: 'puhallinNopeus', label: 'Pyörimisnopeus / EC-asetus', type: 'text', unit: '% / rpm', section: 'Puhallin' },
      { id: 'laakerit', label: 'Laakerit ja kiinnitys', type: 'select', options: KUNTO, section: 'Puhallin' },
      { id: 'hihna', label: 'Hihna ja hihnapyörät', type: 'select', options: ['Kunnossa', 'Kiristetty', 'Vaihdettu', 'Vika'], section: 'Puhallin', when: (_v, form) => form.kenttaModuulit?.ilmapuoli?.puhallinTyyppi === 'AC hihnaveto' },
      { id: 'juoksupyora', label: 'Juoksupyörä puhdas', type: 'toggle', section: 'Puhallin' },
      { id: 'suodatinTyyppi', label: 'Suodattimien tyyppi', type: 'text', fixed: true, section: 'Suodattimet' },
      { id: 'suodatinDp', label: 'Suodattimen paine-ero', type: 'text', unit: 'Pa', section: 'Suodattimet' },
      { id: 'suodatinHalytys', label: 'Tukkeutumishälytys', type: 'select', options: KUNTO_EI_OLE, section: 'Suodattimet' },
      { id: 'suodattimetVaihdettu', label: 'Suodattimet vaihdettu', type: 'toggle', section: 'Suodattimet' },
      { id: 'kondenssivesi', label: 'Kondenssivesi / vesilukko', type: 'select', options: KUNTO, section: 'Kondenssivesi' },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'kostutus',
    title: 'Kostutus',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.kostutus === true,
    fields: [
      { id: 'sylinteriTyyppi', label: 'Sylinterin tyyppi', type: 'select', options: ['Kertakäyttöinen', 'Avattava'], fixed: true, when: (_v, form) => form.laiteKokoonpano?.vakKostutinTyyppi !== 'muu' },
      { id: 'sylinteri', label: 'Höyrysylinterin kunto', type: 'select', options: ['Kunnossa', 'Puhdistettu', 'Vaihdettu', 'Vika'], required: true, when: (_v, form) => form.laiteKokoonpano?.vakKostutinTyyppi !== 'muu' },
      { id: 'tunnit', label: 'Sylinterin käyttötunnit', type: 'text', unit: 'h', when: (_v, form) => form.laiteKokoonpano?.vakKostutinTyyppi !== 'muu' },
      { id: 'tuntilaskuriNollattu', label: 'Tuntilaskuri nollattu', type: 'toggle', when: (v) => v.sylinteri === 'Vaihdettu' },
      { id: 'virta', label: 'Sylinterin virta', type: 'text', unit: 'A' },
      { id: 'hoyryletku', label: 'Höyryletku ja kondenssi', type: 'select', options: KUNTO },
      { id: 'venttiilit', label: 'Vesiliitäntä ja tyhjennys', type: 'select', options: KUNTO },
      { id: 'johtokyky', label: 'Veden johtokyky', type: 'text', unit: 'µS/cm' },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'kuivaus',
    title: 'Kuivaus',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.kuivaus === true,
    fields: [
      { id: 'toiminta', label: 'Kuivauksen toiminta', type: 'select', options: KUNTO },
      { id: 'jalkilammitys', label: 'Jälkilämmityksen asetusarvo', type: 'text', unit: '°C' },
      { id: 'virtaL1', label: 'Vastusten virta L1', type: 'text', unit: 'A', when: (_v, form) => Boolean(form.laiteKokoonpano?.vakKuivausKw?.trim()) },
      { id: 'virtaL2', label: 'Vastusten virta L2', type: 'text', unit: 'A', when: (_v, form) => Boolean(form.laiteKokoonpano?.vakKuivausKw?.trim()) },
      { id: 'virtaL3', label: 'Vastusten virta L3', type: 'text', unit: 'A', when: (_v, form) => Boolean(form.laiteKokoonpano?.vakKuivausKw?.trim()) },
      { id: 'ylilampo', label: 'Ylilämpösuoja testattu', type: 'select', options: KUNTO, when: (_v, form) => Boolean(form.laiteKokoonpano?.vakKuivausKw?.trim()) },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'lammitys',
    title: 'Lämmitys',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone' && vakHeatingOn(form),
    fields: [
      { id: 'toiminta', label: 'Lämmityksen toiminta', type: 'select', options: KUNTO, when: (_v, form) => vakHeatingOn(form) },
      { id: 'virta', label: 'Lämmitysvastusten virta', type: 'text', unit: 'A', when: (_v, form) => vakHeatingOn(form) && form.laiteKokoonpano?.vakLammitysTyyppi === 'sahko' },
      { id: 'ventiili', label: 'Lämmityspatterin venttiili ja toimilaite', type: 'select', options: KUNTO, when: (_v, form) => vakHeatingOn(form) && form.laiteKokoonpano?.vakLammitysTyyppi === 'vesi' },
      { id: 'meno', label: 'Lämmityksen menovesi', type: 'text', unit: '°C', measured: true, when: (_v, form) => vakHeatingOn(form) && form.laiteKokoonpano?.vakLammitysTyyppi === 'vesi' },
      { id: 'paluu', label: 'Lämmityksen paluuvesi', type: 'text', unit: '°C', measured: true, when: (_v, form) => vakHeatingOn(form) && form.laiteKokoonpano?.vakLammitysTyyppi === 'vesi' },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'vakMittaukset',
    title: 'Mittaukset ja asetusarvot',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone',
    fields: [
      { id: 'asetusarvo', label: 'Lämpötilan asetusarvo', type: 'text', unit: '°C', section: 'Lämpötila' },
      { id: 'saatoalue', label: 'Säätöalue / neutraalivyöhyke', type: 'text', unit: 'K', section: 'Lämpötila' },
      { id: 'jaahdytysToiminta', label: 'Jäähdytyksen toiminta', type: 'select', options: KUNTO, section: 'Lämpötila', when: (_v, form) => vakCoolingOn(form) },
      { id: 'tuloIlma', label: 'Tuloilma', type: 'text', unit: '°C', measured: true, section: 'Lämpötila' },
      { id: 'poistoIlma', label: 'Poistoilma', type: 'text', unit: '°C', measured: true, section: 'Lämpötila' },
      { id: 'kosteusAsetus', label: 'Kostutuksen asetusarvo', type: 'text', unit: '%RH', required: true, section: 'Kosteus', when: (_v, form) => form.laiteKokoonpano?.kostutus === true },
      { id: 'kosteusSaatoalue', label: 'Säätöalue / hystereesi', type: 'text', unit: '%RH', section: 'Kosteus', when: (_v, form) => form.laiteKokoonpano?.kostutus === true },
      { id: 'kosteusMitattu', label: 'Mitattu kosteus', type: 'text', unit: '%RH', section: 'Kosteus', when: (_v, form) => form.laiteKokoonpano?.kostutus === true },
      { id: 'kuivausAsetus', label: 'Kuivauksen asetusarvo', type: 'text', unit: '%RH', section: 'Kosteus', when: (_v, form) => form.laiteKokoonpano?.kuivaus === true },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'vakOhjaus',
    title: 'Ohjaus',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone',
    fields: [
      { id: 'saadin', label: 'Säädin (valmistaja / malli)', type: 'text', fixed: true },
      { id: 'halytyksetKuitattu', label: 'Hälytykset kuitattu', type: 'toggle' },
      { id: 'halytykset', label: 'Hälytysten toiminta', type: 'select', options: KUNTO },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
];

export function findFieldModule(id: string): FieldModuleDefinition | undefined {
  return FIELD_MODULES.find((m) => m.id === id);
}

export function visibleFieldModules(form: FieldModuleForm): FieldModuleDefinition[] {
  return FIELD_MODULES.filter((m) => m.isVisible(form));
}

export function fieldModuleValues(form: FieldModuleForm, id: string): Record<string, string | boolean> {
  return form.kenttaModuulit?.[id] ?? {};
}

export function fieldModuleCompletion(form: FieldModuleForm, id: string): MaintenanceTabCompletionState {
  const def = findFieldModule(id);
  if (!def) return 'incomplete';
  const values = fieldModuleValues(form, id);
  const filled = (fieldId: string) => String(values[fieldId] ?? '').trim() !== '';
  const isRequired = (f: FieldModuleField) =>
    f.type !== 'textarea' && (f.requiredWhen ? f.requiredWhen(values, form) : 'required' in f && !!f.required);
  const shown = def.fields.filter((f) => fieldModuleFieldVisible(f, values, form));
  if (shown.some((f) => isRequired(f) && !filled(f.id))) return 'incomplete';
  if (shown.some((f) => f.type === 'select' && values[f.id] === FIELD_MODULE_FAULT_VALUE)) return 'attention';
  return 'ok';
}

export function fieldModuleSummary(form: FieldModuleForm, id: string): string {
  const def = findFieldModule(id);
  if (!def) return '';
  const values = fieldModuleValues(form, id);
  return def.fields
    .filter((f) => f.type !== 'textarea' && fieldModuleFieldVisible(f, values, form) && String(values[f.id] ?? '').trim())
    .slice(0, 3)
    .map((f) => `${f.label}: ${fieldModuleDisplayValue(f, values)}`)
    .join(' · ');
}

export function hasFieldModuleFault(form: FieldModuleForm): boolean {
  return visibleFieldModules(form).some((m) => fieldModuleCompletion(form, m.id) === 'attention');
}

/** Näytetäänkö kenttä lomakkeella / tulosteessa. */
export function fieldModuleFieldVisible(field: FieldModuleField, values: Record<string, string | boolean>, form: FieldModuleForm): boolean {
  if (field.legacy) return String(values[field.id] ?? '').trim() !== '';
  return field.when ? field.when(values, form) : true;
}

/** Piilotettu kenttä, jolla on vanha arvo → näytetään vain luku -muodossa ("Aiemmin kirjattu"). */
export function fieldModuleFieldArchived(field: FieldModuleField, values: Record<string, string | boolean>, form: FieldModuleForm): boolean {
  // Yksi höyrystin: vanhat yhteiset ohjausarvot näytetään höyrystimen kortilla (ks. singleEvaporatorLegacyOhjaus).
  if (field.id === 'hoyrystinOhjaus') return false;
  if (field.section === 'Höyrystimien ohjaus' && evaporatorCount(form) <= 1 && isKylmioDevice(form.laiteTyyppi)) return false;
  return !fieldModuleFieldVisible(field, values, form) && String(values[field.id] ?? '').trim() !== '';
}

export function fieldModuleFieldRequired(field: FieldModuleField, values: Record<string, string | boolean>, form: FieldModuleForm): boolean {
  if (field.type === 'textarea' || field.type === 'toggle') return false;
  return field.requiredWhen ? field.requiredWhen(values, form) : 'required' in field && !!field.required;
}

/** Kentän arvo tekstinä yksikköineen (tuloste, yhteenveto, vain luku). */
export function fieldModuleDisplayValue(f: FieldModuleField, values: Record<string, string | boolean>): string {
  const raw = values[f.id];
  if (f.type === 'toggle') return raw === true || raw === 'true' ? 'Kyllä' : '';
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (f.type === 'pt') {
    const t = String(values[f.tempId] ?? '').trim();
    return `${v} bar${t ? ` (${t} °C)` : ''}`;
  }
  return f.type === 'text' && f.unit ? `${v} ${f.unit}` : v;
}

/** Yksi höyrystin: vanhat vaiheen 5 yhteiset ohjausarvot höyrystimen kentille (vain tyhjien varana). */
export function singleEvaporatorLegacyOhjaus(form: FieldModuleForm): Record<string, string> {
  if (!isKylmioDevice(form.laiteTyyppi) || evaporatorCount(form) > 1) return {};
  const o = form.kenttaModuulit?.ohjaukset ?? {};
  const t = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const ovi = t('ovi');
  return Object.fromEntries(Object.entries({
    lampotilaAsetus: t('asetusarvo'),
    halytysYla: t('halytysYla'),
    halytysAla: t('halytysAla'),
    sulatusVali: t('sulatusvali'),
    sulatusLopetusLämpötila: t('sulatusLopetus'),
    ovikytkin: ovi === 'Ovikytkin' ? 'ovikytkin' : ovi === 'Munakello' ? 'munakello' : ovi === 'Ei ole' ? 'ei' : '',
    ohjausTyyppi: t('ohjausTyyppi') === 'Elektroninen säädin' ? 'saadin' : t('ohjausTyyppi') === 'Termostaatti' ? 'termostaatti' : t('ohjausTyyppi') === 'Kiinteistöautomaatio' ? 'kiinteisto' : '',
  }).filter(([, v]) => v));
}

/** Höyrystimen data + vanhat yhteiset ohjausarvot tyhjiin kenttiin (yksi höyrystin). */
export function evaporatorWithLegacyOhjaus<T extends object>(ev: T, form: FieldModuleForm, index: number): T {
  if (index !== 0 || !ev) return ev;
  const rec = ev as Record<string, unknown>;
  const legacy = singleEvaporatorLegacyOhjaus(form);
  const keys = Object.keys(legacy).filter((k) => !String(rec[k] ?? '').trim());
  if (!keys.length) return ev;
  return { ...ev, ...Object.fromEntries(keys.map((k) => [k, legacy[k]])) } as T;
}
