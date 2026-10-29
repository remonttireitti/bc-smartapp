import { useSyncExternalStore } from 'react';
import {
  addConflict,
  deleteOutbox,
  listConflicts,
  listOutbox,
  mergeServerRow,
  putOutbox,
  recordSent,
  getRow,
  type OutboxEntry,
} from './store';
import { idbGet } from './idb';
import type { Row } from './restQuery';

export type OfflineConfig = {
  restBase: string;
  getHeaders: () => Promise<Record<string, string>>;
  realFetch: typeof fetch;
};

let cfg: OfflineConfig | null = null;
export function configureOffline(c: OfflineConfig) {
  cfg = c;
}
export const getOfflineConfig = () => cfg;

export type OfflineStatus = {
  online: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  flushing: boolean;
  /** true hetken sen jälkeen kun jono tyhjeni synkronoinnissa */
  justSynced: boolean;
  authNeeded: boolean;
};

let status: OfflineStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  failed: 0,
  conflicts: 0,
  flushing: false,
  justSynced: false,
  authNeeded: false,
};
const listeners = new Set<() => void>();
function setStatus(patch: Partial<OfflineStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export async function refreshOfflineStatus(): Promise<void> {
  try {
    const list = await listOutbox();
    const conflicts = (await listConflicts()).length;
    setStatus({
      online: navigator.onLine,
      pending: list.filter((e) => e.state === 'pending').length,
      failed: list.filter((e) => e.state === 'failed').length,
      conflicts,
    });
  } catch {
    /* IndexedDB ei käytettävissä */
  }
}

class TransientError extends Error {}
class AuthError extends Error {}

function classify(res: Response): never {
  if (res.status === 401 || (res.status === 403 && res.headers.get('www-authenticate'))) throw new AuthError('auth');
  if (res.status === 408 || res.status === 429 || res.status >= 500) throw new TransientError(String(res.status));
  throw new Error(String(res.status));
}

async function failText(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { message?: string };
    return `${res.status} ${j.message ?? ''}`.trim();
  } catch {
    return String(res.status);
  }
}

const IGNORE_KEYS = new Set(['updated_at']);

/** Kolmitieyhdistys: ristiriita jos palvelimen arvo poikkeaa sekä lähtötilasta, omista aiemmista lähetyksistä että uudesta arvosta. */
export function findConflictKeys(server: Row, payload: Row, base: Row, sent: Record<string, string[]>): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (IGNORE_KEYS.has(key)) continue;
    if (!(key in base)) continue; // lähtötilaa ei tiedetä → ei voida todistaa ristiriitaa
    const s = JSON.stringify(server[key] ?? null);
    if (s === JSON.stringify(value ?? null)) continue;
    if (s === JSON.stringify(base[key] ?? null)) continue;
    if ((sent[key] ?? []).includes(s)) continue;
    keys.push(key);
  }
  return keys;
}

type ReplayResult = { kind: 'done' } | { kind: 'failed'; error: string };

async function replay(e: OutboxEntry): Promise<ReplayResult> {
  if (!cfg) throw new TransientError('config');
  const h = { ...(await cfg.getHeaders()), 'Content-Type': 'application/json' };
  const url = `${cfg.restBase}/${e.table}`;
  const real = cfg.realFetch;
  let asUpdate = e.op === 'update';

  if (e.op === 'insert') {
    await recordSent(e.table, e.id, e.payload);
    const res = await real(url, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ ...e.payload, id: e.id }) });
    if (res.ok) return { kind: 'done' };
    if (res.status === 409) asUpdate = true; // sama id jo palvelimella (aiempi yritys meni läpi) → idempotentti jatko
    else if (res.status === 401 || res.status >= 500 || res.status === 408 || res.status === 429) classify(res);
    else return { kind: 'failed', error: await failText(res) };
  }

  if (asUpdate) {
    const getRes = await real(`${url}?id=eq.${encodeURIComponent(e.id)}&select=*`, { headers: h });
    if (!getRes.ok) {
      if (getRes.status === 401 || getRes.status >= 500) classify(getRes);
      return { kind: 'failed', error: await failText(getRes) };
    }
    const rows = (await getRes.json()) as Row[];
    const server = rows[0];
    if (!server) return { kind: 'failed', error: 'Rivi puuttuu palvelimelta' };
    if (e.table === 'maintenance_reports') {
      const sent = (await getRow(e.table, e.id))?.sent ?? {};
      const conflictKeys = findConflictKeys(server, e.payload, e.base, sent);
      if (conflictKeys.length > 0) {
        // Palvelimella uudempi muutos: säilytä molemmat → offline-versio omaksi luonnoksekseen.
        const { id: _id, created_at: _c, updated_at: _u, completed_at: _done, ...rest } = server;
        void _id; void _c; void _u; void _done;
        const copyId = crypto.randomUUID();
        const merged: Row = { ...rest, ...e.payload, id: copyId, status: 'draft', completed_at: null };
        const title = (merged.title as string | null) ?? null;
        merged.title = title ? `${title} (offline-kopio)` : 'Offline-kopio';
        if (merged.data && typeof merged.data === 'object') {
          merged.data = { ...(merged.data as Row), offlineKopioAlkuperaisesta: e.id, offlineKopioAika: new Date().toISOString() };
        }
        const res = await real(url, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(merged) });
        if (!res.ok && res.status !== 409) {
          if (res.status === 401 || res.status >= 500) classify(res);
          return { kind: 'failed', error: await failText(res) };
        }
        await addConflict({ id: e.id, copyId, table: e.table, at: Date.now() });
        return { kind: 'done' };
      }
    }
    await recordSent(e.table, e.id, e.payload);
    const res = await real(`${url}?id=eq.${encodeURIComponent(e.id)}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify(e.payload),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status >= 500 || res.status === 408 || res.status === 429) classify(res);
      return { kind: 'failed', error: await failText(res) };
    }
    const out = (await res.json()) as Row[];
    if (!out[0]) return { kind: 'failed', error: 'Päivitys ei osunut riviin (oikeudet?)' };
    await mergeServerRow(e.table, out[0]);
  }
  return { kind: 'done' };
}

let flushing = false;
let syncedTimer: ReturnType<typeof setTimeout> | null = null;

async function runFlush(): Promise<void> {
  if (flushing || !cfg || !navigator.onLine) return;
  flushing = true;
  setStatus({ flushing: true, authNeeded: false });
  let hadWork = false;
  try {
    const list = await listOutbox();
    const blocked = new Set<string>();
    for (const e of list) {
      const key = `${e.table}:${e.id}`;
      if (blocked.has(key)) continue;
      if (e.state === 'failed') {
        blocked.add(key);
        continue;
      }
      hadWork = true;
      let result: ReplayResult;
      try {
        result = await replay(e);
      } catch (err) {
        if (err instanceof AuthError) setStatus({ authNeeded: true });
        break; // verkko/palvelinvirhe/auth: pysäytä, yritetään myöhemmin — mitään ei poisteta
      }
      const seq = e.seq as number;
      if (result.kind === 'failed') {
        const fresh = (await idbGet<OutboxEntry>('outbox', seq)) ?? e;
        await putOutbox({ ...fresh, state: 'failed', error: result.error, attempts: fresh.attempts + 1 });
        blocked.add(key);
        continue;
      }
      const fresh = await idbGet<OutboxEntry>('outbox', seq);
      if (fresh && fresh.ts !== e.ts) {
        // Muutettu lähetyksen aikana → jätä jonoon (nyt päivityksenä), uusin tila ei katoa.
        await putOutbox({ ...fresh, op: 'update', base: { ...e.payload } });
      } else {
        await deleteOutbox(seq);
      }
    }
  } finally {
    flushing = false;
    setStatus({ flushing: false });
    await refreshOfflineStatus();
    if (hadWork && status.pending === 0 && status.failed === 0) {
      setStatus({ justSynced: true });
      if (syncedTimer) clearTimeout(syncedTimer);
      syncedTimer = setTimeout(() => setStatus({ justSynced: false }), 5000);
      document.dispatchEvent(new CustomEvent('bc-smartapp:offline-synced'));
    }
  }
}

export async function flushOutbox(): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) {
    await locks.request('bc-smartapp-outbox', { ifAvailable: true }, async (lock) => {
      if (lock) await runFlush();
    });
  } else {
    await runFlush();
  }
}

/** Epäonnistuneet takaisin jonoon ja uusi yritys. */
export async function retryFailed(): Promise<void> {
  for (const e of await listOutbox()) if (e.state === 'failed') await putOutbox({ ...e, state: 'pending', error: undefined });
  await refreshOfflineStatus();
  await flushOutbox();
}

let started = false;
export function startOfflineSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void refreshOfflineStatus().then(() => flushOutbox());
  window.addEventListener('online', () => {
    setStatus({ online: true });
    void refreshOfflineStatus().then(() => flushOutbox());
  });
  window.addEventListener('offline', () => setStatus({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshOfflineStatus().then(() => flushOutbox());
  });
  window.setInterval(() => {
    if (navigator.onLine && (status.pending > 0 || status.authNeeded)) void flushOutbox();
  }, 15_000);
}

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

/** true = tallennus voidaan jonottaa offline-tilassa (IndexedDB käytössä). */
export function offlineSaveAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
