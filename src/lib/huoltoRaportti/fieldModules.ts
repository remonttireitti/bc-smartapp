/**
 * Kokoonpanon mukaan näytettävät kenttämoduulit (ohjaukset, kostutus, kuivaus, lämmitys-/jäähdytystoiminto).
 * Arvot: form.kenttaModuulit[moduuliId][kenttaId].
 */
import { isKylmioDevice, vjHeatingEnabled, type KenttaModuuliArvot, type LaiteKokoonpano } from './deviceKokoonpano';
import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';

export type FieldModuleId =
  | 'ohjaukset'
  | 'kylmioMittaukset'
  | 'lammitystoiminto'
  | 'mlpAktiivijaahdytys'
  | 'kostutus'
  | 'kuivaus';

type FieldExtras = {
  /** Väliotsikko, joka näytetään kun ryhmä vaihtuu. */
  section?: string;
  /** Näytetäänkö kenttä (vanha arvo näytetään aina). */
  when?: (values: Record<string, string | boolean>, form: FieldModuleForm) => boolean;
  /** Pakollisuus tilanteen mukaan (ohittaa required). */
  requiredWhen?: (values: Record<string, string | boolean>, form: FieldModuleForm) => boolean;
  /** Vain vanhojen raporttien arvo: näytetään vain jos täytetty. */
  legacy?: boolean;
};
export type FieldModuleField = FieldExtras & (
  | { id: string; label: string; type: 'text'; unit?: string; required?: boolean }
  | { id: string; label: string; type: 'select'; options: string[]; required?: boolean }
  | { id: string; label: string; type: 'textarea' });

export type FieldModuleDefinition = {
  id: FieldModuleId;
  title: string;
  fields: FieldModuleField[];
  isVisible: (form: FieldModuleForm) => boolean;
};

export type FieldModuleForm = {
  laiteTyyppi: string;
  laiteKokoonpano?: LaiteKokoonpano;
  kenttaModuulit?: KenttaModuuliArvot;
  evaporatorData?: unknown[];
};

export const HOYRYSTIN_OHJAUS_YHTEINEN = 'Yhteinen';
export const HOYRYSTIN_OHJAUS_OMA = 'Jokaisella oma';

function evaporatorCount(form: FieldModuleForm): number {
  return Array.isArray(form.evaporatorData) ? form.evaporatorData.length : 0;
}

/** Kylmiö: onko höyrystimien ohjaus yhteinen (ohjaukset-vaiheessa) vai höyrystinkohtainen (höyrystimen kortilla). */
export function kylmioEvaporatorOhjausShared(form: FieldModuleForm): boolean {
  if (evaporatorCount(form) <= 1) return true;
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
      { id: 'saadin', label: 'Säädin (valmistaja / malli)', type: 'text', section: 'Koneikko' },
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
      { id: 'tilaLampo', label: 'Tilan lämpötila', type: 'text', unit: '°C', required: true },
      { id: 'konehuoneLampo', label: 'Konehuone / ulkolämpötila', type: 'text', unit: '°C' },
      { id: 'hoyrystinIlmaSisaan', label: 'Höyrystin, ilma sisään', type: 'text', unit: '°C', legacy: true },
      { id: 'hoyrystinIlmaUlos', label: 'Höyrystin, ilma ulos', type: 'text', unit: '°C', legacy: true },
      { id: 'lauhdutinSisaan', label: 'Lauhdutin, ilma/neste sisään', type: 'text', unit: '°C', legacy: true },
      { id: 'lauhdutinUlos', label: 'Lauhdutin, ilma/neste ulos', type: 'text', unit: '°C', legacy: true },
    ],
  },
  {
    id: 'lammitystoiminto',
    title: 'Lämmitystoiminto',
    isVisible: (form) => vjHeatingEnabled(form),
    fields: [
      { id: 'asetusarvo', label: 'Lämmityksen asetusarvo', type: 'text', unit: '°C' },
      { id: 'meno', label: 'Menovesi lämmityksessä', type: 'text', unit: '°C' },
      { id: 'paluu', label: 'Paluuvesi lämmityksessä', type: 'text', unit: '°C' },
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
      { id: 'meno', label: 'Menovesi jäähdytyksessä', type: 'text', unit: '°C' },
      { id: 'paluu', label: 'Paluuvesi jäähdytyksessä', type: 'text', unit: '°C' },
      { id: 'vaihtoventtiilit', label: 'Vaihtoventtiilit', type: 'select', options: KUNTO, required: true },
      { id: 'kastepiste', label: 'Kastepistevahti', type: 'select', options: KUNTO_EI_OLE },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'kostutus',
    title: 'Kostutus (höyrysylinteri)',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.kostutus === true,
    fields: [
      { id: 'asetusarvo', label: 'Kostutuksen asetusarvo', type: 'text', unit: '%RH', required: true },
      { id: 'mitattu', label: 'Mitattu kosteus', type: 'text', unit: '%RH' },
      { id: 'sylinteri', label: 'Höyrysylinteri', type: 'select', options: ['Kunnossa', 'Puhdistettu', 'Vaihdettu', 'Vika'], required: true },
      { id: 'virta', label: 'Sylinterin virta', type: 'text', unit: 'A' },
      { id: 'venttiilit', label: 'Täyttö- ja tyhjennysventtiilit', type: 'select', options: KUNTO },
      { id: 'johtokyky', label: 'Veden johtokyky', type: 'text', unit: 'µS/cm' },
      { id: 'huomio', label: 'Huomiot', type: 'textarea' },
    ],
  },
  {
    id: 'kuivaus',
    title: 'Kuivaus (sähkövastukset)',
    isVisible: (form) => form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.kuivaus === true,
    fields: [
      { id: 'asetusarvo', label: 'Kuivauksen asetusarvo', type: 'text', unit: '%RH' },
      { id: 'jalkilammitys', label: 'Jälkilämmityksen asetusarvo', type: 'text', unit: '°C' },
      { id: 'virtaL1', label: 'Vastusten virta L1', type: 'text', unit: 'A' },
      { id: 'virtaL2', label: 'Vastusten virta L2', type: 'text', unit: 'A' },
      { id: 'virtaL3', label: 'Vastusten virta L3', type: 'text', unit: 'A' },
      { id: 'ylilampo', label: 'Ylilämpösuoja testattu', type: 'select', options: KUNTO, required: true },
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
  if (def.fields.some((f) => isRequired(f) && !filled(f.id))) return 'incomplete';
  if (def.fields.some((f) => f.type === 'select' && values[f.id] === FIELD_MODULE_FAULT_VALUE)) return 'attention';
  return 'ok';
}

export function fieldModuleSummary(form: FieldModuleForm, id: string): string {
  const def = findFieldModule(id);
  if (!def) return '';
  const values = fieldModuleValues(form, id);
  return def.fields
    .filter((f) => f.type !== 'textarea' && String(values[f.id] ?? '').trim())
    .slice(0, 3)
    .map((f) => `${f.label}: ${String(values[f.id])}${f.type === 'text' && f.unit ? ` ${f.unit}` : ''}`)
    .join(' · ');
}

export function hasFieldModuleFault(form: FieldModuleForm): boolean {
  return visibleFieldModules(form).some((m) => fieldModuleCompletion(form, m.id) === 'attention');
}

/** Näytetäänkö kenttä lomakkeella / tulosteessa. */
export function fieldModuleFieldVisible(field: FieldModuleField, values: Record<string, string | boolean>, form: FieldModuleForm): boolean {
  const hasValue = String(values[field.id] ?? '').trim() !== '';
  if (hasValue) return true;
  if (field.legacy) return false;
  return field.when ? field.when(values, form) : true;
}

export function fieldModuleFieldRequired(field: FieldModuleField, values: Record<string, string | boolean>, form: FieldModuleForm): boolean {
  if (field.type === 'textarea') return false;
  return field.requiredWhen ? field.requiredWhen(values, form) : !!field.required;
}
