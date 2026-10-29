import { idbAll, idbClear, idbDelete, idbGet, idbPut } from './idb';
import type { Row } from './restQuery';

/** Taulut, joiden rivit pidetään rivitasolla offline-välimuistissa ja joihin saa kirjoittaa offline. */
export const ROW_TABLES = ['maintenance_reports', 'equipment', 'customers', 'equipment_notes'] as const;
export type RowTable = (typeof ROW_TABLES)[number];
export const isRowTable = (t: string): t is RowTable => (ROW_TABLES as readonly string[]).includes(t);

export type RowEntry = { k: string; table: string; id: string; row: Row; sent: Record<string, string[]>; at: number };
export type OutboxEntry = {
  seq?: number;
  table: RowTable;
  op: 'insert' | 'update';
  id: string;
  payload: Row;
  /** Palvelimelta tiedetty arvo muokatuille sarakkeille jonoon pantaessa (kolmitieyhdistämistä varten). */
  base: Row;
  ts: number;
  state: 'pending' | 'failed';
  error?: string;
  attempts: number;
};
export type OfflineCustomer = { id: string; name: string; at: number; devices: number; reports: number };
export type ConflictInfo = { id: string; copyId: string; table: string; at: number };

const rowKey = (table: string, id: string) => `${table}:${id}`;
const SENT_KEEP = 12;

export async function getRow(table: string, id: string): Promise<RowEntry | undefined> {
  return idbGet<RowEntry>('rows', rowKey(table, id));
}

export async function allRows(table: string): Promise<RowEntry[]> {
  return (await idbAll<RowEntry>('rows')).filter((r) => r.table === table);
}

/** Yhdistä palvelimelta nähty rivi (sarakkeet yhdistyvät, upotetut relaatiot säilyvät). */
export async function mergeServerRow(table: string, row: Row): Promise<void> {
  const id = row.id == null ? null : String(row.id);
  if (!id) return;
  const prev = await getRow(table, id);
  await idbPut<RowEntry>('rows', {
    k: rowKey(table, id),
    table,
    id,
    row: { ...(prev?.row ?? {}), ...row },
    sent: prev?.sent ?? {},
    at: Date.now(),
  });
}

export async function recordSent(table: string, id: string, patch: Row): Promise<void> {
  const prev = await getRow(table, id);
  const sent = { ...(prev?.sent ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    const s = JSON.stringify(value ?? null);
    sent[key] = [...(sent[key] ?? []).filter((x) => x !== s), s].slice(-SENT_KEEP);
  }
  await idbPut<RowEntry>('rows', {
    k: rowKey(table, id),
    table,
    id,
    row: prev?.row ?? { id },
    sent,
    at: Date.now(),
  });
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await idbAll<OutboxEntry>('outbox');
  return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

export async function putOutbox(entry: OutboxEntry): Promise<void> {
  await idbPut('outbox', entry);
}

export async function deleteOutbox(seq: number): Promise<void> {
  await idbDelete('outbox', seq);
}

/** Jonoon: sama rivi yhdistetään edelliseen merkintään (autosave ei paisuta jonoa, viimeisin tila säilyy). */
export async function enqueue(table: RowTable, op: 'insert' | 'update', id: string, patch: Row, base: Row): Promise<void> {
  const list = await listOutbox();
  const existing = [...list].reverse().find((e) => e.table === table && e.id === id);
  if (existing) {
    existing.payload = { ...existing.payload, ...patch };
    existing.state = 'pending';
    existing.error = undefined;
    existing.ts = Date.now();
    await putOutbox(existing);
    return;
  }
  const baseCols: Row = {};
  for (const key of Object.keys(patch)) if (key in base) baseCols[key] = base[key];
  await putOutbox({ table, op, id, payload: { ...patch }, base: baseCols, ts: Date.now(), state: 'pending', attempts: 0 });
}

export function applyOverlay(table: string, rows: Row[], outbox: OutboxEntry[]): Row[] {
  const mine = outbox.filter((e) => e.table === table);
  if (mine.length === 0) return rows;
  return rows.map((r) => {
    const e = mine.find((x) => x.id === String(r.id));
    return e ? { ...r, ...e.payload } : r;
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await idbGet<{ key: string; value: T }>('meta', key))?.value;
}
export async function setMeta<T>(key: string, value: T): Promise<void> {
  await idbPut('meta', { key, value });
}

export async function listOfflineCustomers(): Promise<OfflineCustomer[]> {
  return (await getMeta<OfflineCustomer[]>('offlineCustomers')) ?? [];
}
export async function setOfflineCustomers(list: OfflineCustomer[]): Promise<void> {
  await setMeta('offlineCustomers', list);
  try {
    if (list.length > 0) localStorage.setItem('bc-offline-enabled', '1');
    else localStorage.removeItem('bc-offline-enabled');
  } catch { /* ignore */ }
  const { mirrorAuthSession } = await import('../supabase');
  mirrorAuthSession(list.length > 0);
}

export async function listConflicts(): Promise<ConflictInfo[]> {
  return (await getMeta<ConflictInfo[]>('conflicts')) ?? [];
}
export async function addConflict(c: ConflictInfo): Promise<void> {
  await setMeta('conflicts', [...(await listConflicts()), c]);
}
export async function clearConflicts(): Promise<void> {
  await setMeta('conflicts', []);
}

/** Uloskirjautuessa: poista välimuisti, mutta ÄLÄ koskaan lähettämättömiä muutoksia. */
export async function clearOfflineCaches(): Promise<void> {
  await idbClear('rows');
  await idbClear('urls');
  await setMeta('offlineCustomers', []);
  await setMeta('conflicts', []);
  try {
    localStorage.removeItem('bc-offline-enabled');
  } catch { /* ignore */ }
}
