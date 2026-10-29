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
  | 'kylmaaine'
  | `piiri:${number}`
  | 'yksikot'
  | 'lauhdutus'
  | 'hoyrystys'
  | 'konvektorit'
  | 'mittaukset'
  | 'lisat'
  | 'lopetus';

/**
 * Kaikilla laitetyypeillä sama järjestys: perustiedot → kylmäaine → kylmäainepiiri (kompressori)
 * → lauhdutus → höyrystys / keruu / jäähdytys / lämmitys → ohjaukset ja mittaukset → huomiot.
 */
const ORDER: string[] = ['perustiedot', 'kylmaaine', 'piiri', 'yksikot', 'lauhdutus', 'hoyrystys', 'konvektorit', 'mittaukset', 'lisat', 'lopetus'];

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
  if (id === 'raportointi' || id === 'kokoonpano') return 'perustiedot';
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
  if (['ohjaukset', 'kylmioMittaukset', 'lammitystoiminto', 'mlpAktiivijaahdytys', 'kostutus', 'kuivaus', 'energia'].includes(id)) return 'mittaukset';
  if (id === 'huomiot' || id === 'huoltotiedot') return 'lopetus';
  return 'lisat';
}

function groupTitle(id: string, entries: MaintenanceDocumentEntry[], circuitCount: number, laiteTyyppi?: string): string {
  if (id === 'perustiedot') return 'Perustiedot';
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
  if (id === 'konvektorit') return 'Konvektorit';
  if (id === 'mittaukset') {
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
  const rank = (k: string) => ORDER.indexOf(k.startsWith('piiri:') ? 'piiri' : k) * 100 + (k.startsWith('piiri:') ? Number(k.slice(6)) : 0);
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
