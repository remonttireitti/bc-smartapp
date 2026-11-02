// VAK-tuloste: kokoonpano, piirit, lauhdutuspiiri (vesi), toiminnot; tyhjät rivit ja laskemattomat arvot jäävät pois. Ei Supabasea.
// Ajo (Playwright-kansiosta, vite käynnissä): BASE=http://localhost:5307 PDF_OUT=/workspace/vik-print-sample.pdf node e2e-vik-print.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5307';
const PDF_OUT = process.env.PDF_OUT || '';
const DUMP = process.env.DUMP === '1';
const b = await chromium.launch(); const checks = {};
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
const gen = (variant) => p.evaluate(async (variant) => {
  const d = await import('/src/lib/huoltoRaportti/defaults.ts');
  const h = await import('/src/lib/huoltoRaportti/printHtml.ts');
  const base = d.createEmptyHuoltoReportData();
  const circuit = (n) => d.ensureRefrigerantCircuitData({
    onKaytossa: true, kompressorienMaara: '1', imupaine: n === 1 ? '6.2' : '6.0', imuLampotila: n === 1 ? '14' : '13', korkeapaine: n === 1 ? '19' : '18.5',
    nestePutkiLampotila: n === 1 ? '31' : '30', nestelasiKaytossa: true, nestelasiKuplat: 'kupliton', kuivainKaytossa: true, kuivainOK: true,
    kompressori1: { ...d.ensureRefrigerantCircuitData(null).kompressori1, valmistaja: 'Copeland', malli: `ZR${n}8` },
  });
  const fullKokoonpano = {
    vakKylmaainepiiri: true, vakJaahdytys: true, vakLammitys: true, vakLammitysTyyppi: 'sahko', vakLammitysKw: '6',
    kostutus: true, vakKostutinTyyppi: 'hoyrysylinteri', vakKostutinMalli: 'Carel UE018', kuivaus: true, vakKuivausKw: '3', vakVesiventtiili: 'paineohjattu',
  };
  const fullModules = {
    lampotilansaato: { asetusarvo: '22', saatoalue: '2', jaahdytysToiminta: 'Kunnossa', lammitysToiminta: 'Kunnossa', lammitysVirta: '8.7', tuloIlma: '14.5', poistoIlma: '23.1' },
    kostutus: { asetusarvo: '50', saatoalue: '5', mitattu: '48', sylinteri: 'Puhdistettu', virta: '7.9', venttiilit: 'Kunnossa', johtokyky: '420' },
    kuivaus: { asetusarvo: '55', toiminta: 'Kunnossa', jalkilammitys: '24', virtaL1: '4.4', virtaL2: '4.3', virtaL3: '4.4', ylilampo: 'Kunnossa' },
    ilmapuoli: { suodatinTyyppi: 'F7', suodattimetVaihdettu: 'true', puhallin: 'Kunnossa', puhallinVirta: '3.2', kondenssivesi: 'Kunnossa' },
    vakOhjaus: { saadin: 'Carel pCO5', halytyksetKuitattu: 'true', halytykset: 'Kunnossa' },
  };
  const lauhdutuspiiri = d.ensureLauhdutuspiiriData({
    tarkastusTila: 'ok', neste: '4.18', virtaus: '2.4', meno: '24', tulo: '31', paineTarkastettu: true, paineBar: '2.1',
    painesäätimenTarkistettu: true, painesäätimenMalli: 'Danfoss WVS 22', vesiventtiiliAsetusBar: '16', lmvPuhdistettu: true, lmvKunto: 'Kunnossa',
    pumppuTarkastettu: false, mutapussiPuhdistettu: true,
  });
  const common = { ...base, laiteTyyppi: 'vakioilmastointtikone', laiteTunnus: 'VIK-1', huoltoPaivamaara: '2026-11-02', kylmaaineTyyppi: 'R-410A', kylmaainePiireja: '2',
    lauhdutinTyyppiLaite: 'nestekiertoinen_vain_lmv' };
  if (variant === 'full') {
    return h.generateMaintenanceReportHtml({ ...common, laiteKokoonpano: fullKokoonpano, kenttaModuulit: fullModules,
      selectedModules: { ...base.selectedModules, kylmaainePiiri: true, hoyrystin: true, lauhdutin: true },
      kylmaainePiiri1: circuit(1), kylmaainePiiri2: circuit(2), lauhdutuspiiriData: lauhdutuspiiri }, { companyName: 'Testifirma' });
  }
  return h.generateMaintenanceReportHtml({ ...common, laiteKokoonpano: { vakKylmaainepiiri: true, vakJaahdytys: true, vakLammitys: false, kostutus: true, kuivaus: false },
    kenttaModuulit: { kostutus: { asetusarvo: '45' } },
    selectedModules: { ...base.selectedModules, kylmaainePiiri: true, hoyrystin: true, lauhdutin: true } }, { companyName: 'Testifirma' });
}, variant);
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
const full = await gen('full'); const ft = text(full);
if (DUMP) console.log(ft);
for (const [k, re] of Object.entries({
  'kokoonpano-rivi': /Kokoonpano .*suora höyrystys.*Toiminnot Jäähdytys.*Lämmitys \(sähkövastukset, 6 kW\).*Kostutus \(höyrysylinteri, Carel UE018\).*Kuivaus \(3 kW\)/,
  'kokoonpano: vesiventtiili': /vesiventtiili: paineohjattu/,
  'piiri 1 + 2': /Kylmäainepiiri 1.*Kylmäainepiiri 2/,
  'lauhdutuspiiri tulostuu (vain LMV)': /Lauhdutuspiiri/,
  'lauhdutuspiiri: vesiventtiilin asetus': /Vesiventtiilin asetus 16 bar/,
  'lauhdutuspiiri: LMV puhdistettu': /✓ Lämmönsiirrin puhdistettu/,
  'lauhdutuspiiri: LMV kunto': /Lämmönsiirtimen kunto Kunnossa/,
  'lauhdutuspiiri: neste vesi': /Neste Vesi/,
  'jäähdytys/lämmitys: asetus': /Lämpötilan asetusarvo 22 °C/,
  'jäähdytys/lämmitys: säätöalue': /Säätöalue \/ neutraalivyöhyke 2 K/,
  'jäähdytys/lämmitys: tulo/poisto': /Tuloilma 14,5 °C.*Poistoilma 23,1 °C/,
  'lämmityksen toiminta': /Lämmityksen toiminta Kunnossa/,
  'kostutus: asetusarvo': /Kostutuksen asetusarvo 50 %RH/,
  'kostutus: säätöalue': /Säätöalue \/ hystereesi 5 %RH/,
  'kostutus: mitattu': /Mitattu kosteus 48 %RH/,
  'kostutus: sylinteri + virta': /Höyrysylinterin kunto Puhdistettu.*Sylinterin virta 7,9 A/,
  'kostutus: vesiliitäntä': /Vesiliitäntä ja tyhjennys Kunnossa/,
  'kostutus: johtokyky': /Veden johtokyky 420 µS\/cm/,
  'kuivaus: asetus + toiminta': /Kuivauksen asetusarvo 55 %RH.*Kuivauksen toiminta Kunnossa/,
  'ilmapuoli: suodatin': /Suodattimien tyyppi F7/, 'ilmapuoli: vaihdettu': /✓ Suodattimet vaihdettu/, 'ilmapuoli: kondenssivesi': /Kondenssivesi \/ vesilukko Kunnossa/,
  'ohjaus: säädin + kuittaus': /Säädin \(valmistaja \/ malli\) Carel pCO5/, 'ohjaus: hälytykset kuitattu': /✓ Hälytykset kuitattu/,
})) checks[k] = re.test(ft);
checks['ei "Valitse..." -tekstiä'] = !/Valitse\.\.\./.test(ft);
checks['ei ilmalauhdutinlaatikkoa nestelauhdutuksella'] = !/Lauhdutin 1/.test(ft);
checks['ei 0,00 / 0 kW'] = !/\b0[.,]0+\s*kW/.test(ft);
checks['ei "Ei voida laskea"'] = !/Ei voida laskea/i.test(ft);
const sparse = await gen('sparse'); const st = text(sparse);
if (DUMP) console.log('--- SPARSE ---\n' + st);
checks['sparse: kostutuksen asetusarvo'] = /Kostutuksen asetusarvo 45 %RH/.test(st);
checks['sparse: ei kuivausta (pois päältä)'] = !/Kuivaus/.test(st.replace(/Kokoonpano[^]*?(?=Kylmäaine|KYLMÄAINE)/i, ''));
checks['sparse: ei lämmitystä (pois päältä)'] = !/Lämmityksen toiminta|Lämmitysvastusten virta/.test(st);
checks['sparse: ei suodatinriviä'] = !/Suodattimien tyyppi|Suodattimet vaihdettu/.test(st);
checks['sparse: ei 0,00'] = !/\b0[.,]00\b/.test(st);
checks['sparse: ei tyhjiä lohkoja'] = !/<div class="blk"><div class="sh">[^<]*<\/div><div class="kv2"><\/div><\/div>/.test(sparse);
checks['sparse: ei tyhjiä kv2-ruudukkoja'] = !/<div class="kv2">\s*<\/div>/.test(sparse);
if (PDF_OUT) {
  const pg = await ctx.newPage(); await pg.setContent(full, { waitUntil: 'load' }); await pg.emulateMedia({ media: 'print' });
  await pg.pdf({ path: PDF_OUT, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  const pg2 = await ctx.newPage(); await pg2.setContent(sparse, { waitUntil: 'load' }); await pg2.emulateMedia({ media: 'print' });
  await pg2.pdf({ path: PDF_OUT.replace(/\.pdf$/, '-sparse.pdf'), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
}
checks['ei sivuvirheitä'] = errs.length === 0;
console.log(checks, errs);
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
