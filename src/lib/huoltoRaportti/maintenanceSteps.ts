import type { MaintenanceDocumentEntry } from './maintenanceDocumentUnitEntries';
import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';

/** Vaihe = joukko loogisesti yhteen kuuluvia moduuleja yhdellä näkymällä. */
export type MaintenanceStepGroup = {
  key: string;
  title: string;
  entryIndexes: number[];
};

export type MaintenanceStepStatus = 'ok' | 'incomplete' | 'fault';

/** Poistaa numeroinnin (esim. "5.2 ", "4.1b ") otsikon alusta. */
export function stripSectionNumber(title: string): string {
  return title.replace(/^\d+(\.\d+)*[a-z]?\.?\s+/, '');
}

type GroupId =
  | 'perustiedot'
  | 'kokoonpano'
  | 'kylmaaine'
  | `piiri:${number}`
  | 'yksikot'
  | 'lauhdutus'
  | 'hoyrystys'
  | 'vesikenno'
  | 'kostutus'
  | 'kuivlamm'
  | 'ilmapuoli'
  | 'vakohjaus'
  | 'toiminnot'
  | 'konvektorit'
  | 'mittaukset'
  | 'lisat'
  | 'lopetus';

/**
 * Kaikilla laitetyypeillä sama järjestys: perustiedot → kylmäaine → kylmäainepiiri (kompressori)
 * → lauhdutus → höyrystys / keruu / jäähdytys / lämmitys → ohjaukset ja mittaukset → huomiot.
 */
/**
 * VAK (CRAC / close control): perustiedot → kokoonpano → kylmäaine → piirit → höyrystin (DX) / vesikenno
 * → lauhdutin → ilmapuoli (puhallin, suodattimet, kondenssi) → kostutus → kuivaus/lämmitys
 * → mittaukset ja asetusarvot → ohjaus ja hälytykset → huomiot.
 */
const VAK_ORDER: string[] = ['perustiedot', 'kokoonpano', 'kylmaaine', 'piiri', 'yksikot', 'hoyrystys', 'vesikenno', 'lauhdutus', 'ilmapuoli', 'kostutus', 'kuivlamm', 'mittaukset', 'vakohjaus', 'lisat', 'lopetus'];

const ORDER: string[] = ['perustiedot', 'kokoonpano', 'kylmaaine', 'piiri', 'yksikot', 'lauhdutus', 'hoyrystys', 'toiminnot', 'konvektorit', 'mittaukset', 'lisat', 'lopetus'];

/** Lauhdutuspuolen moduulit (nestekiertoisen koneen latauspiiri mukaan lukien). */
function isCondenserSide(entry: MaintenanceDocumentEntry): boolean {
  const id = entry.tabId;
  return entry.kind === 'condenserUnit'
    || entry.kind === 'condenserConfig'
    || id === 'lauhdutin'
    || id === 'lauhdutuspiiri'
    || id === 'nestelauhduttimet'
    || (entry.kind === 'mlpUnit' && entry.mlpUnitId === 'latauspiiri');
}

function groupOf(entry: MaintenanceDocumentEntry): GroupId {
  const id = entry.tabId;
  if (id === 'raportointi') return 'perustiedot';
  if (id === 'kokoonpano') return 'kokoonpano';
  if (id === 'kylmaaine' || id === 'tiiveyskoe' || id === 'tyhjiointi') return 'kylmaaine';
  if (id.startsWith('kylmaainePiiri')) return `piiri:${entry.unitIndex ?? 0}`;
  if (isCondenserSide(entry)) return 'lauhdutus';
  if (entry.kind === 'evaporatorUnit' || id === 'hoyrystin') return 'hoyrystys';
  if (entry.kind === 'lampopumppuUnit') {
    return entry.lampopumppuUnitId === 'mittaukset' ? 'mittaukset' : 'yksikot';
  }
  if (id === 'konvektorit') return 'konvektorit';
  if (entry.kind === 'mlpUnit') return entry.mlpUnitId === 'energia' ? 'mittaukset' : 'hoyrystys';
  if (['jaahdytysvesi', 'vapaajahdytys', 'kiinteistoJahdytys', 'mlp'].includes(id)) return 'hoyrystys';
  if (id === 'vesikenno') return 'vesikenno';
  // VAK: ei yleistä "Toiminnot"-vaihetta — jokainen kenttä kysytään omassa loogisessa moduulissaan.
  if (id === 'kostutus' || id === 'ilmapuoli') return id;
  if (id === 'kuivaus' || id === 'lammitys') return 'kuivlamm';
  if (id === 'vakMittaukset') return 'mittaukset';
  if (id === 'vakOhjaus') return 'vakohjaus';
  if (['ohjaukset', 'kylmioMittaukset', 'lammitystoiminto', 'mlpAktiivijaahdytys', 'energia'].includes(id)) return 'mittaukset';
  if (id === 'huomiot' || id === 'huoltotiedot') return 'lopetus';
  return 'lisat';
}

function groupTitle(id: string, entries: MaintenanceDocumentEntry[], circuitCount: number, laiteTyyppi?: string): string {
  if (id === 'perustiedot') return 'Perustiedot';
  if (id === 'kokoonpano') return 'Kokoonpano';
  if (id === 'kylmaaine') return 'Kylmäaine';
  if (id.startsWith('piiri:')) return circuitCount > 1 ? `Piiri ${Number(id.slice(6)) + 1}` : 'Kylmäainepiiri';
  if (id === 'lauhdutus') {
    if (entries.some((e) => e.kind === 'condenserConfig') || entries.every((e) => e.kind === 'condenserUnit')) return 'Lauhdutin';
    return entries.length === 1 ? stripSectionNumber(entries[0].title) : 'Lauhdutus';
  }
  if (id === 'hoyrystys') {
    if (entries.every((e) => e.kind === 'evaporatorUnit' || e.tabId === 'hoyrystin')) return 'Höyrystin';
    if (entries.length === 1) return stripSectionNumber(entries[0].title);
    return laiteTyyppi === 'mlp' || laiteTyyppi === 'vesiilmalampopumppu' ? 'Keruu ja lämmitys' : 'Jäähdytys';
  }
  if (id === 'yksikot') return entries.length > 1 ? 'Ulko- ja sisäyksiköt' : stripSectionNumber(entries[0].title);
  if (id === 'vesikenno') return 'Jäähdytysvesikenno';
  if (id === 'kostutus') return 'Kostutus';
  if (id === 'kuivlamm') {
    const hasDry = entries.some((e) => e.tabId === 'kuivaus');
    const hasHeat = entries.some((e) => e.tabId === 'lammitys');
    return hasDry && hasHeat ? 'Kuivaus ja lämmitys' : hasHeat ? 'Lämmitys' : 'Kuivaus';
  }
  if (id === 'vakohjaus') return 'Ohjaus ja hälytykset';
  if (id === 'ilmapuoli') return 'Ilmapuoli';
  if (id === 'toiminnot') return 'Toiminnot';
  if (id === 'konvektorit') return 'Konvektorit';
  if (id === 'mittaukset') {
    if (entries.some((e) => e.tabId === 'vakMittaukset')) return 'Asetusarvot ja ilmamittaukset';
    const hasOhjaus = entries.some((e) => e.tabId === 'ohjaukset');
    return hasOhjaus && entries.length > 1 ? 'Ohjaus ja mittaukset' : hasOhjaus ? 'Ohjaukset' : 'Mittaukset';
  }
  if (id === 'lisat') return entries.length === 1 ? stripSectionNumber(entries[0].title) : 'Lisätarkastukset';
  return 'Huomiot ja kuittaus';
}

export function buildMaintenanceSteps(entries: MaintenanceDocumentEntry[], laiteTyyppi?: string): MaintenanceStepGroup[] {
  const map = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    const id = groupOf(entry);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(index);
  });
  const circuitCount = [...map.keys()].filter((k) => k.startsWith('piiri:')).length;
  const order = laiteTyyppi === 'vakioilmastointtikone' ? VAK_ORDER : ORDER;
  const rank = (k: string) => order.indexOf(k.startsWith('piiri:') ? 'piiri' : k) * 100 + (k.startsWith('piiri:') ? Number(k.slice(6)) : 0);
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([key, entryIndexes]) => ({
      key,
      title: groupTitle(key, entryIndexes.map((i) => entries[i]), circuitCount, laiteTyyppi),
      entryIndexes,
    }));
}

export function combineStepStatus(states: Array<MaintenanceTabCompletionState | undefined>): MaintenanceStepStatus {
  if (states.some((s) => s === 'attention')) return 'fault';
  if (states.some((s) => s !== 'ok')) return 'incomplete';
  return 'ok';
}
