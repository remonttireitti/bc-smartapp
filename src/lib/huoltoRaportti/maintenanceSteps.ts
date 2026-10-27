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
  | 'lammonsiirtimet'
  | 'yksikot'
  | 'konvektorit'
  | 'nestepiirit'
  | 'mittaukset'
  | 'lisat'
  | 'lopetus';

const ORDER: string[] = ['perustiedot', 'kylmaaine', 'piiri', 'lammonsiirtimet', 'yksikot', 'konvektorit', 'nestepiirit', 'mittaukset', 'lisat', 'lopetus'];

function groupOf(entry: MaintenanceDocumentEntry, laiteTyyppi?: string): GroupId {
  const id = entry.tabId;
  // Kylmiö: lauhdutustapa ohjaa vain lauhdutinosaa → näytetään Höyrystin ja lauhdutin -vaiheessa.
  if (id === 'kokoonpano' && (laiteTyyppi === 'pakastin' || laiteTyyppi === 'kylmäkoneikko')) return 'lammonsiirtimet';
  if (id === 'raportointi' || id === 'kokoonpano') return 'perustiedot';
  if (id === 'kylmaaine' || id === 'tiiveyskoe' || id === 'tyhjiointi') return 'kylmaaine';
  if (id.startsWith('kylmaainePiiri')) return `piiri:${entry.unitIndex ?? 0}`;
  if (entry.kind === 'evaporatorUnit' || entry.kind === 'condenserUnit' || id === 'hoyrystin' || id === 'lauhdutin') return 'lammonsiirtimet';
  if (entry.kind === 'lampopumppuUnit') {
    return entry.lampopumppuUnitId === 'mittaukset' ? 'mittaukset' : 'yksikot';
  }
  if (id === 'konvektorit') return 'konvektorit';
  if (entry.kind === 'mlpUnit') return entry.mlpUnitId === 'energia' ? 'mittaukset' : 'nestepiirit';
  if (['lauhdutuspiiri', 'nestelauhduttimet', 'jaahdytysvesi', 'vapaajahdytys', 'kiinteistoJahdytys', 'mlp'].includes(id)) return 'nestepiirit';
  if (['ohjaukset', 'kylmioMittaukset', 'lammitystoiminto', 'mlpAktiivijaahdytys', 'kostutus', 'kuivaus', 'energia'].includes(id)) return 'mittaukset';
  if (id === 'huomiot' || id === 'huoltotiedot') return 'lopetus';
  return 'lisat';
}

function groupTitle(id: string, entries: MaintenanceDocumentEntry[], circuitCount: number): string {
  if (id === 'perustiedot') return 'Perustiedot';
  if (id === 'kylmaaine') return 'Kylmäaine';
  if (id.startsWith('piiri:')) return circuitCount > 1 ? `Piiri ${Number(id.slice(6)) + 1}` : 'Kylmäainepiiri';
  if (id === 'lammonsiirtimet') {
    const evap = entries.some((e) => e.kind === 'evaporatorUnit' || e.tabId === 'hoyrystin');
    const cond = entries.some((e) => e.kind === 'condenserUnit' || e.tabId === 'lauhdutin');
    return evap && cond ? 'Höyrystin ja lauhdutin' : evap ? 'Höyrystin' : 'Lauhdutin';
  }
  if (id === 'yksikot') return entries.length > 1 ? 'Ulko- ja sisäyksiköt' : stripSectionNumber(entries[0].title);
  if (id === 'konvektorit') return 'Konvektorit';
  if (id === 'nestepiirit') return entries.length === 1 ? stripSectionNumber(entries[0].title) : 'Nestepiirit';
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
    const id = groupOf(entry, laiteTyyppi);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(index);
  });
  const circuitCount = [...map.keys()].filter((k) => k.startsWith('piiri:')).length;
  const rank = (k: string) => ORDER.indexOf(k.startsWith('piiri:') ? 'piiri' : k) * 100 + (k.startsWith('piiri:') ? Number(k.slice(6)) : 0);
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([key, entryIndexes]) => ({
      key,
      title: groupTitle(key, entryIndexes.map((i) => entries[i]), circuitCount),
      entryIndexes,
    }));
}

export function combineStepStatus(states: Array<MaintenanceTabCompletionState | undefined>): MaintenanceStepStatus {
  if (states.some((s) => s === 'attention')) return 'fault';
  if (states.some((s) => s !== 'ok')) return 'incomplete';
  return 'ok';
}
