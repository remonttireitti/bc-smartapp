/**
 * Pieni Supabase-mock edge-funktioiden testaukseen (Node). Data: globalThis.__edgeDb.
 * work_reports-kysely, jossa on embed "(...)", palauttaa PGRST201-virheen (kuten tuotannossa
 * work_report_equipment-liitostaulun jälkeen moniselitteinen equipment(...)-embed).
 */
export function createClient() {
  const db = globalThis.__edgeDb;
  return {
    from(table) {
      const state = { table, select: '*', filters: [], single: false };
      const builder = {
        select(cols) { state.select = String(cols); return builder; },
        eq(col, val) { state.filters.push((row) => row[col] === val); return builder; },
        in(col, vals) { state.filters.push((row) => vals.includes(row[col])); return builder; },
        or(expr) {
          const parts = String(expr).split(',').map((p) => p.split('.eq.'));
          state.filters.push((row) => parts.some(([col, val]) => row[col] === val));
          return builder;
        },
        order() { return builder; },
        maybeSingle() { state.single = true; return builder; },
        single() { state.single = true; return builder; },
        then(resolve, reject) {
          try { resolve(run(state)); } catch (e) { reject(e); }
        },
      };
      return builder;
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path) {
            return { data: { signedUrl: `https://signed.example/${bucket}/${path}` }, error: null };
          },
        };
      },
    },
  };

  function run(state) {
    db.queries.push({ table: state.table, select: state.select });
    if (state.table === 'work_reports' && state.select.includes('(')) {
      return { data: null, error: { code: 'PGRST201', message: 'Could not embed because more than one relationship was found' } };
    }
    let rows = (db.tables[state.table] ?? []).filter((row) => state.filters.every((f) => f(row)));
    // Pelkät sarakkeet (ei embedejä): palauta vain valitut kuten PostgREST.
    if (state.select !== '*' && !state.select.includes('(')) {
      const cols = state.select.split(',').map((c) => c.trim()).filter(Boolean);
      rows = rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
    }
    if (state.single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}
