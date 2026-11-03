// Viat: pöytäkirjan "Havaitut viat" + huoltohistorian vikalista kaikille laitetyypeille. Ei Supabasea, ei kirjoituksia.
// Ajo: BASE=http://localhost:5311 PDF_DIR=/workspace node scripts/e2e-fault-notes.mjs   (vite käynnissä)
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:5311';
const PDF_DIR = process.env.PDF_DIR || '';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const count = (s, re) => (s.match(re) ?? []).length;

const run = (kind) => p.evaluate(async (kind) => {
  const d = await import('/src/lib/huoltoRaportti/defaults.ts');
  const h = await import('/src/lib/huoltoRaportti/printHtml.ts');
  const f = await import('/src/lib/huoltoRaportti/reportFaults.ts');
  const hist = await import('/src/lib/equipmentMaintenanceHistory.ts');
  const sum = await import('/src/lib/huoltoRaportti/moduleSummaryRows.ts');
  const tab = await import('/src/lib/huoltoRaportti/maintenanceDocumentTabSummary.ts');
  const base = d.createEmptyHuoltoReportData();
  const ok = { ...base, huoltoPaivamaara: '2026-11-03', huoltoSuoritettu: true, huoltoSuorittajaNimi: 'Testaaja' };
  let data;
  if (kind === 'ilp') {
    data = { ...ok, laiteTyyppi: 'lämpöpumppu', laiteTunnus: 'JK F87', laiteValmistaja: 'Fujitsu', laiteMalli: 'AOYG30LMTA', sisayksikkoMaara: 2,
      ulkoyksikkoTarkastusTila: 'faulty', ulkoyksikkoTarkastusHuomio: 'Ulkoyksikkö tärisee', kylmaaineTyyppi: 'R-410A',
      sisayksikkoData: [
        { tyyppi: 'seina', malli: 'ASYG30', sarjanumero: 'S1', kondenssivesi: 'painovoimainen', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'faulty', kondenssiTestattu: 'ok', huomio: '<strong>Äänekäs puhallin</strong>', huomioTyyppi: 'vika' },
        { tyyppi: 'seina', malli: 'ASYG30', sarjanumero: 'S2', kondenssivesi: 'painovoimainen', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'ok', kondenssiTestattu: 'ok', huomio: '', huomioTyyppi: 'kommentti' },
      ],
      huomiot: '<strong>Laite heikkotehoinen</strong>', huomiotLuonne: 'kommentti' };
  } else if (kind === 'ilp-ok') {
    data = { ...ok, laiteTyyppi: 'lämpöpumppu', laiteTunnus: 'OK1', sisayksikkoMaara: 1, ulkoyksikkoTarkastusTila: 'ok',
      sisayksikkoData: [{ tyyppi: 'seina', malli: 'M', sarjanumero: 'S', kondenssivesi: 'painovoimainen', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'ok', kondenssiTestattu: 'ok', huomio: '', huomioTyyppi: 'kommentti' }],
      huomiot: 'Kaikki kunnossa', huomiotLuonne: 'kommentti' };
  } else if (kind === 'kylmio') {
    const c = d.ensureRefrigerantCircuitData({ onKaytossa: true, kompressorienMaara: '2', imupaine: '3', korkeapaine: '16', paisuntaventtiiliTila: 'faulty', paisuntaventtiiliHuomio: 'Venttiili juuttuu',
      kompressori1: { ...d.ensureRefrigerantCircuitData(null).kompressori1, malli: 'ZB45', tarkastusTila: 'faulty', tarkastusHuomio: 'Öljyvuoto' } });
    data = { ...ok, laiteTyyppi: 'pakastin', laiteTunnus: 'KM1', kylmaaineTyyppi: 'R-404A', kylmaainePiireja: '1', kylmaainePiiri1: c,
      selectedModules: { ...base.selectedModules, kylmaainePiiri: true, hoyrystin: true, lauhdutin: true },
      evaporatorData: [{ ...base.evaporatorData[0], tarkastusTila: 'faulty', tarkastusHuomio: 'Jäätynyt kenno' }],
      huomiot: 'Tarkista ensi kerralla', huomiotLuonne: 'vika' };
  } else if (kind === 'vak') {
    data = { ...ok, laiteTyyppi: 'vakioilmastointtikone', laiteTunnus: 'VIK-1', kylmaainePiireja: '1',
      laiteKokoonpano: { vakVariantti: 'nestekierto', vakKylmaainepiiri: false, vakJaahdytys: true, kostutus: true },
      kenttaModuulit: { kostutus: { asetusarvo: '50', sylinteriTyyppi: 'Avattava', sylinteri: 'Vika' } } };
    data.selectedModules = (await import('/src/lib/huoltoRaportti/deviceModuleLogic.ts')).resolveAutoModules({ laiteTyyppi: 'vakioilmastointtikone', lauhdutinTyyppiLaite: 'nestekiertoinen', vapaajahdytysKaytossa: false, laiteKokoonpano: data.laiteKokoonpano, manualModules: base.selectedModules });
  } else if (kind === 'konvektori') {
    data = { ...ok, laiteTyyppi: 'konvektorit', laiteKayttotarkoitus: 'Verkosto', konvektoriRows: [
      { id: 'a', tyyppi: 'katto', tunnus: 'K-1', valmistaja: '', malli: '', sarjanumero: '', suodatinPuhdistettu: true, kennoPuhdistettu: false, kondenssiTarkastettu: true, puhallinTarkastettu: true, venttiiliTarkastettu: true, huomio: '', huomioTyyppi: 'kommentti' },
      { id: 'b', tyyppi: 'katto', tunnus: 'K-2', valmistaja: '', malli: '', sarjanumero: '', suodatinPuhdistettu: true, kennoPuhdistettu: true, kondenssiTarkastettu: true, puhallinTarkastettu: true, venttiiliTarkastettu: true, huomio: 'Kaikki hyvin', huomioTyyppi: 'kommentti' } ] };
  } else if (kind === 'mlp') {
    data = { ...ok, laiteTyyppi: 'mlp', laiteTunnus: 'MLP1', kylmaaineTyyppi: 'R-410A',
      selectedModules: { ...base.selectedModules, mlpPiirit: true },
      mlpData: { ...(base.mlpData ?? {}), keruupiiriTarkastusTila: 'faulty', keruupiiriTarkastusHuomio: 'Keruupumppu ääntelee' } };
  }
  data = d.normalizeHuoltoReportData(data);
  const html = h.generateMaintenanceReportHtml(data, { companyName: 'Testifirma' });
  const faults = f.collectReportFaults(data);
  const eq = { id: 'e1', name: 'Laite', tag: data.laiteTunnus };
  const row = { id: 'r1', equipment_id: 'e1', data, updated_at: '2026-11-03T10:00:00Z', completed_at: null, created_at: '2026-11-03T09:00:00Z' };
  const entries = hist.buildMaintenanceHistoryForEquipment(eq, [row], [], []);
  const histHtml = hist.buildMaintenanceHistoryPrintHtml({ customerName: 'Testi Oy', sections: [{ deviceLabel: 'Laite', entries }], branding: { companyName: 'Testifirma' } });
  const rows = sum.lampopumppuSummaryRows(data, 'ulkoyksikko').concat(sum.lampopumppuSummaryRows(data, 'sisayksikko'));
  return { html, histHtml, faults, rows, huomiotTab: tab.buildMaintenanceDocumentTabSummary('huomiot', data) };
}, kind);

const out = {};
for (const k of ['ilp', 'ilp-ok', 'kylmio', 'vak', 'konvektori', 'mlp']) out[k] = await run(k);

// ILP
{
  const { html, histHtml, faults, rows, huomiotTab } = out.ilp; const t = text(html); const ht = text(histHtml);
  check(faults.length === 2 && faults[0].source === 'Ulkoyksikkö' && faults[1].source === 'Sisäyksikkö 1', `ilp: viat = ulkoyksikkö + sisäyksikkö 1 (${JSON.stringify(faults)})`);
  check(/Havaitut viat Ulkoyksikkö Ulkoyksikkö tärisee Sisäyksikkö 1 sivuääniä; Äänekäs puhallin/.test(t), 'ilp: pöytäkirjassa Havaitut viat -yhteenveto');
  check(/✗ Vika havaittu/.test(t), 'ilp: yleistulos Vika havaittu');
  check(!/Sisäyksikkö 2 ei kunnossa/.test(t) && count(t, /Havaitut viat/g) === 1, 'ilp: sisäyksikkö 2 (ok) ei vikalistassa, yhteenveto kerran');
  check(/Ulkoyksikkö tärisee/.test(ht) && /Äänekäs puhallin/.test(ht) && /Viat:/.test(ht), 'ilp: huoltohistoriassa vikalista (ulko + sisä)');
  check(!/&lt;strong|&lt;\/strong/.test(histHtml), 'ilp: huoltohistoriassa ei raakaa HTML-tagia');
  check(/Huomautukset: Laite heikkotehoinen/.test(ht) && count(ht, /Laite heikkotehoinen/g) === 1, 'ilp: kommentti-huomio kerran "Huomautukset"-rivillä');
  check(count(ht, /Ulkoyksikkö tärisee/g) === 1, 'ilp: ei kaksoiskappaleita historiassa');
  check(rows.some((r) => r.label === 'Vika' && r.value === 'Ulkoyksikkö tärisee') && rows.some((r) => /Vika, sisäyksikkö 1/.test(r.label)), `ilp: editorin kortit näyttävät viat (${JSON.stringify(rows)})`);
  check(huomiotTab === 'Huomioita kirjattu', 'ilp: huomiot-vaihe (huomio kirjattu)');
}
{
  const t = text(out['ilp-ok'].html); const ht = text(out['ilp-ok'].histHtml);
  check(out['ilp-ok'].faults.length === 0 && !/Havaitut viat/.test(t) && /✓ Ei vikaa havaittu/.test(t), 'ilp-ok: ei vikoja → ei yhteenvetoa, "Ei vikaa"');
  check(!/Viat:/.test(ht) && /Huomautukset: Kaikki kunnossa/.test(ht), 'ilp-ok: historiassa vain huomautus');
}
// Kylmiö
{
  const { html, histHtml, faults } = out.kylmio; const t = text(html); const ht = text(histHtml);
  const src = faults.map((f) => f.source).join('|');
  check(src.split('|').filter((x) => x === 'Paisuntaventtiili').length === 1, 'kylmiö: paisuntaventtiili vain kerran'); check(/Kompressori 1/.test(src) && /Paisuntaventtiili/.test(src) && /Höyrystin/.test(src) && /Huomio/.test(src), `kylmiö: viat ${src}`);
  check(/✗ Vika havaittu/.test(t), 'kylmiö: yleistulos Vika havaittu (ennen "Ei vikaa" vaikka kompressori vika)');
  check(/Havaitut viat.*Kompressori 1 — Öljyvuoto.*Paisuntaventtiili — Venttiili juuttuu.*Höyrystin — Jäätynyt kenno.*Huomio — Tarkista ensi kerralla/.test(t), 'kylmiö: yhteenveto sisältää kaikki');
  check(/Viat:.*Kompressori 1 — Öljyvuoto.*Höyrystin — Jäätynyt kenno.*Huomio — Tarkista ensi kerralla/.test(ht) && !/Huomautukset:/.test(ht), 'kylmiö: historia: viat listana, vika-huomio ei kahteen kertaan');
}
{
  const { html, histHtml, faults } = out.vak; const t = text(html); const ht = text(histHtml);
  check(faults.length === 1 && /Kostutus/.test(faults[0].source) && /Höyrysylinterin kunto/.test(faults[0].note), `vak: kenttämoduulin "Vika"-valinta (${JSON.stringify(faults)})`);
  check(/Havaitut viat/.test(t) && /Viat:/.test(ht), 'vak: pöytäkirja + historia');
}
{
  const { html, histHtml, faults } = out.konvektori; const ht = text(histHtml);
  check(faults.length === 1 && faults[0].source === 'Konvektori K-1', `konvektori: vain viallinen rivi (${JSON.stringify(faults)})`);
  check(/Konvektori K-1/.test(ht) && !/K-2/.test(ht), 'konvektori: historiassa K-1, ei K-2');
}
{
  const { html, histHtml, faults } = out.mlp; const ht = text(histHtml);
  check(faults.length === 1 && faults[0].source === 'Keruupiiri' && /Keruupumppu/.test(faults[0].note), `mlp: keruupiiri (${JSON.stringify(faults)})`);
  check(/Keruupiiri — Keruupumppu ääntelee/.test(ht), 'mlp: historiassa');
}
check(errs.length === 0, `ei sivuvirheitä ${errs.join(' | ')}`);
if (PDF_DIR) {
  for (const [k, name] of [['ilp', 'viat-pk-ilp'], ['kylmio', 'viat-pk-kylmio']]) {
    const pg = await ctx.newPage(); await pg.setContent(out[k].html, { waitUntil: 'load' }); await pg.pdf({ path: `${PDF_DIR}/${name}.pdf`, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } }); await pg.close();
  }
  const pg = await ctx.newPage();
  await pg.setContent(out.ilp.histHtml, { waitUntil: 'load' }); await pg.pdf({ path: `${PDF_DIR}/viat-huoltohistoria-ilp.pdf`, format: 'A4', printBackground: true }); await pg.close();
  const pg2 = await ctx.newPage();
  await pg2.setContent(out.kylmio.histHtml, { waitUntil: 'load' }); await pg2.pdf({ path: `${PDF_DIR}/viat-huoltohistoria-kylmio.pdf`, format: 'A4', printBackground: true }); await pg2.close();
}
await b.close();
console.log(fails ? `\n${fails} FAIL` : '\nKAIKKI OK'); process.exit(fails ? 1 : 0);
