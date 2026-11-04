// Huoltohistoria: asiakkaan nykyinen nimi + sama työraportti usealla laitteella näytetään kerran.
// Mockattu Supabase, ei kirjoituksia. Ajo: BASE=http://localhost:5320 PDF=/workspace/huoltohistoria-viite-sample.pdf node scripts/e2e-history-viite.mjs
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:5320';
const PDF = process.env.PDF || '';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const count = (s, re) => (s.match(re) ?? []).length;

const res = await p.evaluate(async () => {
  const d = await import('/src/lib/huoltoRaportti/defaults.ts');
  const hist = await import('/src/lib/equipmentMaintenanceHistory.ts');
  const base = d.createEmptyHuoltoReportData();
  const mk = (tag, extra = {}) => d.normalizeHuoltoReportData({ ...base, asiakas: 'Wärtsilä Vickby', laiteTyyppi: 'lämpöpumppu', laiteTunnus: tag, laiteMalli: 'AOYG30LMTA',
    huoltoPaivamaara: '2026-11-03', huoltoSuoritettu: true, ...extra });
  const eqs = ['JK F81', 'JK F82', 'JK F83'].map((t, i) => ({ id: `e${i + 1}`, name: t, tag: t }));
  const maint = [
    { id: 'm1', equipment_id: 'e1', data: mk('JK F81', { huomiot: 'Suodattimet vaihdettu', huomiotLuonne: 'kommentti' }), updated_at: '2026-11-03T10:00:00Z', completed_at: null, created_at: '2026-11-03T09:00:00Z' },
    { id: 'm2', equipment_id: 'e2', data: mk('JK F82', { huomiot: 'Suodattimet vaihdettu', huomiotLuonne: 'kommentti', sisayksikkoMaara: 1, sisayksikkoData: [{ tyyppi: 'seina', malli: 'M', sarjanumero: 'S', kondenssivesi: 'painovoimainen', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'faulty', kondenssiTestattu: 'ok', huomio: 'sivuääniä', huomioTyyppi: 'vika' }] }), updated_at: '2026-11-03T10:00:00Z', completed_at: null, created_at: '2026-11-03T09:00:00Z' },
    { id: 'm3', equipment_id: 'e3', data: mk('JK F83', { huomiot: 'Eri huomio tälle', huomiotLuonne: 'kommentti' }), updated_at: '2026-11-03T10:00:00Z', completed_at: null, created_at: '2026-11-03T09:00:00Z' },
  ];
  // Mockattu Supabase: vain luku, palauttaa työraportin joka on linkitetty kolmeen laitteeseen
  const tables = {
    maintenance_reports: maint,
    work_reports: [{ id: 'w1', equipment_id: 'e1', owner_company_id: null, title: 'Wärtsilä Vickby – Ilmalämpöpumppujen vuosihuolto', heading: 'Ilmalämpöpumppujen vuosihuolto', description: 'Puhdistettu sisäyksiköt ja tarkistettu ulkoyksiköt.', scheduled_start: '2026-11-03T08:00:00Z', completed_at: null, updated_at: '2026-11-03T12:00:00Z', created_at: '2026-11-03T07:00:00Z' }],
    work_report_equipment: [{ work_report_id: 'w1', equipment_id: 'e1' }, { work_report_id: 'w1', equipment_id: 'e2' }, { work_report_id: 'w1', equipment_id: 'e3' }],
    work_report_daily_logs: [], profiles: [], companies: [],
  };
  const writes = [];
  const sb = { from: (t) => { const q = { _t: t, select(sel) { q._sel = sel; return q; }, eq() { return q; }, in() { return q; },
    then(res) { res({ data: tables[t] ?? [], error: null }); }, insert() { writes.push(t); return q; }, update() { writes.push(t); return q; }, delete() { writes.push(t); return q; } }; return q; } };
  const ctxRows = await hist.loadCustomerMaintenanceContext(sb, 'c1');
  const sections = hist.buildMaintenanceHistorySectionsForEquipmentList(eqs, ctxRows.maintenanceRows, ctxRows.workRows, [], 'Wärtsilä Vikby');
  const single = hist.buildMaintenanceHistoryForEquipment(eqs[1], ctxRows.maintenanceRows, ctxRows.workRows, [], 'Wärtsilä Vikby');
  const oldNameFallback = hist.buildMaintenanceHistoryForEquipment(eqs[0], ctxRows.maintenanceRows, [], []);
  const html = hist.buildMaintenanceHistoryPrintHtml({ customerName: 'Wärtsilä Vikby', sections, branding: { companyName: 'Testifirma' } });
  const singleHtml = hist.buildMaintenanceHistoryPrintHtml({ customerName: 'Wärtsilä Vikby', sections: [{ deviceLabel: 'JK F82', entries: single }], branding: { companyName: 'Testifirma' } });
  const t = d.resolveMaintenanceReportTitle('Wärtsilä Vickby – JK F81 AOYG30LMTA Ilmalämpöpumppu', maint[0].data, 'Wärtsilä Vikby');
  const t2 = d.resolveMaintenanceReportTitle('Wärtsilä Vickby – JK F81', maint[0].data, null);
  const t3 = d.resolveMaintenanceReportTitle(null, maint[0].data, 'Wärtsilä Vikby');
  const labelSame = hist.equipmentLabel({ id: 'x', name: 'JK F81', tag: 'JK F81' });
  return { html, singleHtml, t, t2, t3, writes, oldNameFallback: oldNameFallback.map((e) => e.summary), labelSame };
});

const ht = text(res.html);
check(!/Vickby/.test(res.html), 'ei vanhaa nimeä "Vickby" tulosteessa');
check(count(ht, /Wärtsilä Vikby – JK F8\d AOYG30LMTA/g) === 3, 'huoltopöytäkirjarivit näyttävät nykyisen nimen (Vikby) 3 kpl');
check(count(ht, /Puhdistettu sisäyksiköt/g) === 1, 'työraportin teksti vain kerran (ensimmäisellä laitteella)');
check(/Ks\. JK F81 \(työraportti 3\.11\.2026\)/.test(ht) && count(ht, /Ks\. JK F81/g) === 2, 'muilla laitteilla viite "Ks. JK F81 (työraportti 3.11.2026)" 2 kpl');
check(count(ht, /Suodattimet vaihdettu/g) === 1 && /Huomautukset: ks\. JK F81/.test(ht), 'sama huomautus usealla laitteella: kokonaan kerran, muilla viite');
check(/Eri huomio tälle/.test(ht), 'eri huomautus säilyy kokonaan');
check(count(ht, /Viat:/g) === 1 && /sivuääniä/.test(ht), 'laitekohtaiset viat säilyvät (F82)');
check(!/Wärtsilä Vikby – Ilmalämpöpumppujen/.test(ht) && /Ilmalämpöpumppujen vuosihuolto/.test(ht), 'työraportin otsikko ilman asiakasnimeä');
check(/Puhdistettu sisäyksiköt/.test(text(res.singleHtml)) && !/Ks\. /.test(text(res.singleHtml)), 'yhden laitteen tuloste: koko teksti, ei viitettä');
check(res.t === 'Wärtsilä Vikby – JK F81 AOYG30LMTA Ilmalämpöpumppu', `tallennettu otsikko päivittyy nykyiseen nimeen (${res.t})`);
check(res.t2 === 'Wärtsilä Vickby – JK F81', 'ilman nykyistä nimeä tallennettu otsikko säilyy');
check(/^Wärtsilä Vikby/.test(res.t3), 'ilman tallennettua otsikkoa rakennetaan nykyisellä nimellä');
check(res.labelSame === 'JK F81', `laiteotsikko ei toista tunnusta (${res.labelSame})`);
check(res.writes.length === 0, 'ei kirjoituksia Supabaseen');
check(errs.length === 0, `ei sivuvirheitä ${errs.join(' | ')}`);
if (PDF) { const pg = await ctx.newPage(); await pg.setContent(res.html, { waitUntil: 'load' }); await pg.pdf({ path: PDF, format: 'A4', printBackground: true }); await pg.close(); }
await b.close();
console.log(fails ? `\n${fails} FAIL` : '\nKAIKKI OK'); process.exit(fails ? 1 : 0);
