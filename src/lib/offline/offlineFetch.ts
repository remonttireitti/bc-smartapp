import { idbAll, idbDelete, idbGet, idbPut } from './idb';
import {
  matchesFilter,
  parseRestUrl,
  projectRow,
  sortRows,
  splitTopLevel,
  type RestQuery,
  type Row,
} from './restQuery';
import {
  allRows,
  applyOverlay,
  enqueue,
  getRow,
  isRowTable,
  listOfflineCustomers,
  listOutbox,
  mergeServerRow,
  recordSent,
  type OutboxEntry,
} from './store';
import { configureOffline, flushOutbox, refreshOfflineStatus } from './sync';

type UrlEntry = { url: string; body: string; at: number; contentRange: string | null };
const URL_CACHE_MAX = 1500;
const MAX_BODY = 3_000_000;
const READ_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 12000;

const jsonHeaders = (extra?: Record<string, string>) => ({ 'content-type': 'application/json; charset=utf-8', ...extra });

function rowsResponse(rows: Row[], q: RestQuery, req: Request): Response {
  const wantsObject = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const range = rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0';
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers: jsonHeaders({ 'content-range': range }) });
  if (wantsObject) {
    if (rows.length === 1) return new Response(JSON.stringify(rows[0]), { status: 200, headers: jsonHeaders({ 'content-range': range }) });
    return new Response(
      JSON.stringify({ code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }),
      { status: 406, headers: jsonHeaders() },
    );
  }
  void q;
  return new Response(JSON.stringify(rows), { status: 200, headers: jsonHeaders({ 'content-range': range }) });
}

/** Täytä puuttuvat pyydetyt sarakkeet nulleilla (vain offline-jonossa oleville uusille riveille). */
function fillMissing(row: Row, select: string): Row {
  const out = { ...row };
  for (const item of splitTopLevel(select || '*')) {
    if (item === '*' || item.includes('->')) continue;
    const paren = item.indexOf('(');
    const head = paren >= 0 ? item.slice(0, paren) : item;
    const name = paren >= 0 ? (head.includes(':') ? head.split(':')[0] : head.split('!')[0]) : (head.includes(':') ? head.split(':')[0] : head);
    const col = paren >= 0 ? name : head.includes(':') ? head.split(':')[1] : head;
    if (!(col in out) && !(name in out)) out[col] = null;
  }
  return out;
}

async function isOfflineScope(q: RestQuery, rows: Row[]): Promise<boolean> {
  const offline = new Set((await listOfflineCustomers()).map((c) => c.id));
  const idf = q.filters.find((f) => f.col === 'id' && (f.op === 'eq' || f.op === 'in') && !f.neg);
  if (idf) return true;
  const byCustomer = q.filters.find((f) => f.col === 'customer_id' && (f.op === 'eq' || f.op === 'in') && !f.neg);
  if (byCustomer) {
    const ids = f2list(byCustomer.val);
    return ids.length > 0 && ids.every((id) => offline.has(id));
  }
  const byEquipment = q.filters.find((f) => f.col === 'equipment_id' && (f.op === 'eq' || f.op === 'in') && !f.neg);
  if (byEquipment && q.table !== 'equipment') {
    const eqRows = (await allRows('equipment')).map((r) => r.row);
    const pendingEq: Row[] = (await listOutbox()).filter((e) => e.table === 'equipment' && e.op === 'insert').map((e) => ({ id: e.id, ...e.payload }));
    const all = [...eqRows, ...pendingEq];
    const ids = f2list(byEquipment.val);
    return ids.length > 0 && ids.every((id) => {
      const eq = all.find((r) => String(r.id) === id);
      return eq && offline.has(String(eq.customer_id));
    });
  }
  void rows;
  return false;
}

function f2list(val: string): string[] {
  return val.replace(/^\(/, '').replace(/\)$/, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

async function serveFromRows(req: Request, q: RestQuery): Promise<Response | null> {
  if (!isRowTable(q.table) || q.unsupported) return null;
  const outbox = await listOutbox();
  const cached = (await allRows(q.table)).map((r) => r.row);
  const known = new Set(cached.map((r) => String(r.id)));
  const pendingInserts: Row[] = outbox
    .filter((e) => e.table === q.table && e.op === 'insert' && !known.has(e.id))
    .map((e) => ({ id: e.id, ...e.payload }));
  const pendingIds = new Set(pendingInserts.map((r) => String(r.id)));
  const candidates = [...applyOverlay(q.table, cached, outbox), ...pendingInserts];
  if (!(await isOfflineScope(q, candidates))) return null;

  // Pistehaku: kaikkien pyydettyjen id:iden täytyy löytyä, muuten ei voida tietää onko puuttuva rivi olemassa.
  const idf = q.filters.find((f) => f.col === 'id' && (f.op === 'eq' || f.op === 'in') && !f.neg);
  if (idf) {
    const want = f2list(idf.val);
    if (!want.every((id) => candidates.some((r) => String(r.id) === id))) return null;
  }
  const matched: Row[] = [];
  for (const row of candidates) {
    const isPending = pendingIds.has(String(row.id));
    let ok = true;
    for (const f of q.filters) {
      const r = matchesFilter(row, f);
      if (r === undefined) {
        if (isPending) { ok = false; break; }
        return null;
      }
      if (!r) { ok = false; break; }
    }
    if (ok) matched.push(row);
  }
  const sorted = sortRows(matched, q.order);
  const sliced = q.limit != null ? sorted.slice(q.offset, q.offset + q.limit) : sorted.slice(q.offset);
  const out: Row[] = [];
  for (const row of sliced) {
    const base = pendingIds.has(String(row.id)) ? fillMissing(row, q.select) : row;
    const projected = projectRow(base, q.select);
    if (!projected) return null;
    out.push(projected);
  }
  return rowsResponse(out, q, req);
}

async function serveFromUrlCache(req: Request, q: RestQuery): Promise<Response | null> {
  const hit = await idbGet<UrlEntry>('urls', req.url);
  if (!hit || req.method !== 'GET') return null;
  let body = hit.body;
  if (isRowTable(q.table)) {
    const outbox = await listOutbox();
    if (outbox.some((e) => e.table === q.table)) {
      try {
        const parsed = JSON.parse(body) as Row[] | Row;
        body = JSON.stringify(Array.isArray(parsed) ? applyOverlay(q.table, parsed, outbox) : applyOverlay(q.table, [parsed], outbox)[0]);
      } catch { /* palauta sellaisenaan */ }
    }
  }
  return new Response(body, { status: 200, headers: jsonHeaders(hit.contentRange ? { 'content-range': hit.contentRange } : undefined) });
}

async function storeResponse(req: Request, q: RestQuery, res: Response): Promise<void> {
  if (req.method !== 'GET' || !res.ok) return;
  const text = await res.text();
  if (text.length > MAX_BODY) return;
  await idbPut<UrlEntry>('urls', { url: req.url, body: text, at: Date.now(), contentRange: res.headers.get('content-range') });
  if (Math.random() < 0.02) void pruneUrls();
  if (isRowTable(q.table)) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      await Promise.all(rows.filter((r): r is Row => !!r && typeof r === 'object' && 'id' in (r as Row)).map((r) => mergeServerRow(q.table, r)));
    } catch { /* ei JSON */ }
  }
}

async function pruneUrls() {
  const all = await idbAll<UrlEntry>('urls');
  if (all.length <= URL_CACHE_MAX) return;
  all.sort((a, b) => a.at - b.at);
  for (const e of all.slice(0, all.length - URL_CACHE_MAX + 200)) await idbDelete('urls', e.url);
}

async function overlayLive(res: Response, q: RestQuery): Promise<Response> {
  if (!res.ok || !isRowTable(q.table)) return res;
  const outbox = await listOutbox();
  if (!outbox.some((e) => e.table === q.table)) return res;
  try {
    const parsed = (await res.clone().json()) as Row[] | Row;
    const next = Array.isArray(parsed) ? applyOverlay(q.table, parsed, outbox) : applyOverlay(q.table, [parsed], outbox)[0];
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(next), { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

const dbg = (...a: unknown[]) => {
  try {
    if (localStorage.getItem('bc-offline-debug')) console.info('[offline]', ...a);
  } catch { /* ignore */ }
};
const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError');

export function createOfflineFetch(supabaseUrl: string, getHeaders: () => Promise<Record<string, string>>): typeof fetch {
  const realFetch: typeof fetch = (...args) => globalThis.fetch(...args);
  const restBase = `${supabaseUrl}/rest/v1`;
  configureOffline({ restBase, getHeaders, realFetch });

  async function handleRead(req: Request, q: RestQuery): Promise<Response> {
    const cand = async () => {
      const fromRows = await serveFromRows(req, q);
      dbg('rows', q.table, fromRows ? 'hit' : 'miss');
      if (fromRows) return fromRows;
      const fromUrl = await serveFromUrlCache(req, q);
      dbg('url', q.table, fromUrl ? 'hit' : 'miss');
      return fromUrl;
    };
    if (!navigator.onLine) {
      const c = await cand();
      if (c) return c;
      // Offline luotu pöytäkirja ei voi vielä sisältää kuvia → tyhjä lista, ei virhettä.
      if (q.table === 'maintenance_report_images') {
        const rid = q.filters.find((f) => f.col === 'maintenance_report_id' && f.op === 'eq')?.val;
        if (rid && (await listOutbox()).some((e) => e.table === 'maintenance_reports' && e.op === 'insert' && e.id === rid)) {
          return rowsResponse([], q, req);
        }
      }
      // Ei välimuistissa: nopea virhevastaus (verkkovirhe laukaisisi kirjaston toistuvat uudelleenyritykset).
      return new Response(JSON.stringify({ code: 'OFFLINE_MISS', message: 'Ei saatavilla offline-tilassa', details: null, hint: null }), { status: 404, headers: jsonHeaders() });
    }
    const candidate = await cand().catch(() => null);
    const ctrl = new AbortController();
    const timer = candidate ? setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS) : null;
    try {
      const res = await realFetch(new Request(req, { signal: ctrl.signal }));
      if (timer) clearTimeout(timer);
      try {
        await storeResponse(req, q, res.clone());
      } catch { /* välimuisti ei saa rikkoa lukua */ }
      return await overlayLive(res, q);
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (candidate && isNetworkError(e)) return (await cand().catch(() => null)) ?? candidate;
      throw e;
    }
  }

  async function handleWrite(req: Request, q: RestQuery): Promise<Response | null> {
    const method = req.method;
    const prefer = req.headers.get('prefer') ?? '';
    if (prefer.includes('resolution=') || q.unsupported) return null;
    let body: unknown;
    try {
      body = await req.clone().json();
    } catch {
      return null;
    }
    if (!body || typeof body !== 'object') return null;
    const wantRep = prefer.includes('return=representation');
    let rows: Row[];
    let patch: Row = {};
    if (method === 'POST') {
      const list = (Array.isArray(body) ? body : [body]) as Row[];
      rows = list.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() }));
    } else {
      const idf = q.filters.length === 1 ? q.filters[0] : null;
      if (!idf || idf.col !== 'id' || idf.op !== 'eq' || idf.neg) return null;
      rows = [{ id: idf.val }];
      patch = body as Row;
    }
    const table = q.table as 'maintenance_reports' | 'equipment' | 'equipment_notes';
    const outbox = await listOutbox();
    let queue = !navigator.onLine || outbox.length > 0;

    if (!queue) {
      // Suora yritys aikarajalla; aikakatkaisu/verkkovirhe → jonoon. Lähetetyt versiot kirjataan etukäteen (idempotenssi).
      for (const r of rows) await recordSent(table, String(r.id), method === 'POST' ? r : patch);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), WRITE_TIMEOUT_MS);
      try {
        const init: RequestInit = { method, headers: req.headers, signal: ctrl.signal, body: JSON.stringify(method === 'POST' ? (Array.isArray(body) ? rows : rows[0]) : patch) };
        const res = await realFetch(req.url, init);
        clearTimeout(timer);
        if (res.status === 502 || res.status === 503 || res.status === 504) queue = true;
        else {
          if (res.ok) {
            try {
              if (wantRep) {
                const out = (await res.clone().json()) as Row[] | Row;
                for (const r of Array.isArray(out) ? out : [out]) await mergeServerRow(table, r);
              } else {
                for (const r of rows) await mergeServerRow(table, method === 'POST' ? r : { id: r.id, ...patch });
              }
            } catch { /* ei estä */ }
          }
          return res;
        }
      } catch (e) {
        clearTimeout(timer);
        if (!isNetworkError(e)) throw e;
        queue = true;
      }
    }

    // Jonoon: mitään ei menetetä; palautetaan onnistunut vastaus ja synkronoidaan kun yhteys on.
    const now = new Date().toISOString();
    const result: Row[] = [];
    for (const r of rows) {
      const id = String(r.id);
      if (method === 'POST') {
        const { id: _drop, ...payload } = r;
        void _drop;
        await enqueue(table, 'insert', id, payload, {});
        result.push({ created_at: now, updated_at: now, ...r });
      } else {
        const cached = await getRow(table, id);
        await enqueue(table, 'update', id, patch, cached?.row ?? {});
        result.push({ ...(cached?.row ?? { id }), ...patch });
      }
    }
    await refreshOfflineStatus();
    if (navigator.onLine) setTimeout(() => void flushOutbox(), 4000);
    if (!wantRep) return new Response(null, { status: method === 'POST' ? 201 : 204 });
    const projected = result.map((r) => projectRow(fillMissing(r, q.select), q.select) ?? r);
    const wantsObject = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object');
    return new Response(JSON.stringify(wantsObject ? projected[0] : projected), { status: method === 'POST' ? 201 : 200, headers: jsonHeaders() });
  }

  return async (input, init) => {
    let req: Request;
    try {
      req = new Request(input, init);
    } catch {
      return realFetch(input, init);
    }
    if (typeof indexedDB === 'undefined' || !req.url.startsWith(`${restBase}/`)) return realFetch(req);
    const q = parseRestUrl(req.url, restBase);
    if (!q) return realFetch(req.clone());
    const passthrough = req.clone();
    dbg('start', req.method, q.table, req.url.slice(-60));
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const r = await handleRead(req, q);
        dbg('done read', q.table, r.status);
        return r;
      }
      if (isRowTable(q.table) && q.table !== 'customers' && (req.method === 'POST' || (req.method === 'PATCH' && q.table !== 'equipment_notes'))) {
        const res = await handleWrite(req, q);
        dbg('done write', q.table, res?.status);
        if (res) return res;
      }
    } catch (e) {
      if (isNetworkError(e)) throw e;
      // Oma virhe (esim. IndexedDB ei käytettävissä) → normaali verkkopolku
      if (req.method !== 'GET' && req.method !== 'HEAD') console.warn('offline-kerros ohitettu:', e);
    }
    return realFetch(passthrough);
  };
}

export type { OutboxEntry };
