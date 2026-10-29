/** PostgREST-kyselyn jäsennys ja arviointi välimuistin riveille (puhdasta logiikkaa, ei selainriippuvuuksia). */
export type RestFilter = { col: string; op: string; val: string; neg: boolean };
export type RestQuery = {
  table: string;
  select: string;
  filters: RestFilter[];
  /** true = jokin suodatin, jota ei osata arvioida (or=, gt=, like=…). */
  unsupported: boolean;
  order: { col: string; desc: boolean }[];
  limit: number | null;
  offset: number;
};
export type Row = Record<string, unknown>;

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const SUPPORTED_OPS = new Set(['eq', 'neq', 'in', 'is']);

export function parseRestUrl(url: string, restPrefix: string): RestQuery | null {
  if (!url.startsWith(restPrefix)) return null;
  const u = new URL(url);
  const table = u.pathname.slice(new URL(restPrefix).pathname.length).replace(/^\/+/, '');
  if (!table || table.includes('/')) return null;
  const q: RestQuery = { table, select: '*', filters: [], unsupported: false, order: [], limit: null, offset: 0 };
  for (const [key, value] of u.searchParams.entries()) {
    if (key === 'select') q.select = value;
    else if (key === 'order') {
      q.order = value.split(',').filter(Boolean).map((part) => {
        const [col, ...mods] = part.split('.');
        return { col, desc: mods.includes('desc') };
      });
    } else if (key === 'limit') q.limit = Number(value);
    else if (key === 'offset') q.offset = Number(value) || 0;
    else if (RESERVED.has(key)) continue;
    else if (key === 'or' || key === 'and' || key === 'not') q.unsupported = true;
    else {
      let rest = value;
      let neg = false;
      if (rest.startsWith('not.')) {
        neg = true;
        rest = rest.slice(4);
      }
      const dot = rest.indexOf('.');
      const op = dot < 0 ? rest : rest.slice(0, dot);
      const val = dot < 0 ? '' : rest.slice(dot + 1);
      if (!SUPPORTED_OPS.has(op) || key.includes('.')) q.unsupported = true;
      q.filters.push({ col: key, op, val, neg });
    }
  }
  return q;
}

export function splitTopLevel(select: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function listValues(val: string): string[] {
  const inner = val.replace(/^\(/, '').replace(/\)$/, '');
  return inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

/** undefined = ei voida arvioida (sarake puuttuu välimuistirivistä). */
export function matchesFilter(row: Row, f: RestFilter): boolean | undefined {
  if (!(f.col in row)) return undefined;
  const v = row[f.col];
  let res: boolean;
  if (f.op === 'eq') res = v != null && String(v) === f.val;
  else if (f.op === 'neq') res = v == null || String(v) !== f.val;
  else if (f.op === 'in') res = v != null && listValues(f.val).includes(String(v));
  else if (f.op === 'is') res = f.val === 'null' ? v == null : String(v) === f.val;
  else return undefined;
  return f.neg ? !res : res;
}

/** Projisoi rivin select-listan mukaan. null = jokin pyydetty sarake puuttuu → ei voida palvella luotettavasti. */
export function projectRow(row: Row, select: string): Row | null {
  const items = splitTopLevel(select || '*');
  if (items.length === 1 && items[0] === '*') return { ...row };
  const out: Row = {};
  for (const item of items) {
    if (item === '*') {
      Object.assign(out, row);
      continue;
    }
    const paren = item.indexOf('(');
    if (paren >= 0) {
      // Upotettu relaatio: alias:taulu(...) tai taulu(...) → välimuistissa avaimella alias/nimi.
      const head = item.slice(0, paren);
      const alias = head.includes(':') ? head.split(':')[0] : head.split('!')[0];
      if (!(alias in row)) return null;
      out[alias] = row[alias];
      continue;
    }
    const jsonArrow = item.match(/^(?:(\w+):)?(\w+)->>?(\w+)$/);
    if (jsonArrow) {
      const [, alias, col, key] = jsonArrow;
      const name = alias ?? key;
      if (col in row && row[col] && typeof row[col] === 'object') {
        const v = (row[col] as Row)[key];
        out[name] = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
      } else if (name in row) out[name] = row[name];
      else return null;
      continue;
    }
    const [alias, col] = item.includes(':') ? item.split(':') : [item, item];
    const colName = col.replace(/::.*$/, '');
    if (!(colName in row)) return null;
    out[alias] = row[colName];
  }
  return out;
}

export function sortRows(rows: Row[], order: { col: string; desc: boolean }[]): Row[] {
  if (order.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { col, desc } of order) {
      const x = a[col];
      const y = b[col];
      if (x == y) continue;
      if (x == null) return desc ? -1 : 1;
      if (y == null) return desc ? 1 : -1;
      const cmp = String(x) < String(y) ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}
