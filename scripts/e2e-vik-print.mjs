// VAK-tuloste, kolme varianttia (nestekierto / DX + ilmalauhdutin / DX + nestelauhdutus): kokoonpano, moduulit, tyhjät rivit pois. Ei Supabasea.
// Ajo (Playwright-kansiosta, vite käynnissä): BASE=http://localhost:5307 PDF_DIR=/workspace node e2e-vik-print.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5307';
const PDF_DIR = process.env.PDF_DIR || '';
const DUMP = process.env.DUMP || '';
const b = await chromium.launch(); const checks = {};
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
const gen = (variant, sparse) => p.evaluate(async ([variant, sparse]) => {
  const d = await import('/src/lib/huoltoRaportti/defaults.ts');
  const h = await import('/src/lib/huoltoRaportti/printHtml.ts');
  const m = await import('/src/lib/huoltoRaportti/deviceModuleLogic.ts');
  const base = d.createEmptyHuoltoReportData();
  const circuit = (n) => d.ensureRefrigerantCircuitData({
    onKaytossa: true, kompressorienMaara: '1', imupaine: n === 1 ? '6.2' : '6.0', imuLampotila: n === 1 ? '14' : '13', korkeapaine: n === 1 ? '19' : '18.5',
    nestePutkiLampotila: n === 1 ? '31' : '30', nestelasiKaytossa: true, nestelasiKuplat: 'kupliton', kuivainKaytossa: true, kuivainOK: true,
    kompressori1: { ...d.ensureRefrigerantCircuitData(null).kompressori1, valmistaja: 'Copeland', malli: `ZR${n}8` },
  });
  const functions = { vakJaahdytys: true, vakLammitys: true, vakLammitysTyyppi: 'sahko', vakLammitysKw: '6', kostutus: true, vakKostutinTyyppi: 'hoyrysylinteri', vakKostutinMalli: 'Carel UE018', kuivaus: true, vakKuivausKw: '3' };
  const sparseFunctions = { vakJaahdytys: true, vakLammitys: false, kostutus: true, kuivaus: false };
  const kokoonpano = {
    nestekierto: { vakVariantti: 'nestekierto', vakKylmaainepiiri: false },
    dx_ilma: { vakVariantti: 'dx_ilma', vakKylmaainepiiri: true },
    dx_neste: { vakVariantti: 'dx_neste', vakKylmaainepiiri: true, vakVesiventtiili: 'paineohjattu', vakVesikenno: true },
  }[variant];
  const lk = { ...kokoonpano, ...(sparse ? sparseFunctions : functions) };
  const cond = { nestekierto: 'nestekiertoinen', dx_ilma: 'erillinen_ilma', dx_neste: 'nestekiertoinen_vain_lmv' }[variant];
  const modules = {
    ...(variant === 'nestekierto' || variant === 'dx_neste' ? { vesikenno: { neste: 'Glykoli 30 %', meno: '7', paluu: '12', virtaus: '3.1', paine: '2.2', venttiili: 'Kunnossa', kennoKunto: 'Likainen', kennoPuhdistettu: 'true', ilmaus: 'true', likasuodatin: 'true', vuodot: 'Kunnossa' } } : {}),
    lampotilansaato: { asetusarvo: '22', saatoalue: '2', jaahdytysToiminta: 'Kunnossa', lammitysToiminta: 'Kunnossa', lammitysVirta: '8.7', tuloIlma: '14.5', poistoIlma: '23.1' },
    kostutus: { asetusarvo: '50', saatoalue: '5', mitattu: '48', sylinteriTyyppi: 'Avattava', sylinteri: 'Vaihdettu', tunnit: '2310', tuntilaskuriNollattu: 'true', virta: '7.9', hoyryletku: 'Kunnossa', venttiilit: 'Kunnossa', johtokyky: '420' },
    kuivaus: { asetusarvo: '55', toiminta: 'Kunnossa', jalkilammitys: '24', virtaL1: '4.4', virtaL2: '4.3', virtaL3: '4.4', ylilampo: 'Kunnossa' },
    ilmapuoli: { puhallinTyyppi: 'EC', puhallin: 'Kunnossa', puhallinVirta: '3.2', puhallinNopeus: '72 %', laakerit: 'Kunnossa', juoksupyora: 'true', suodatinTyyppi: 'F7', suodatinDp: '120', suodatinHalytys: 'Kunnossa', suodattimetVaihdettu: 'true', kondenssivesi: 'Kunnossa' },
    vakOhjaus: { saadin: 'Carel pCO5', halytyksetKuitattu: 'true', halytykset: 'Kunnossa' },
  };
  const sparseModules = { kostutus: { asetusarvo: '45' } };
  const lauhdutuspiiri = d.ensureLauhdutuspiiriData({
    tarkastusTila: 'ok', neste: '4.18', virtaus: '2.4', meno: '24', tulo: '31', paineTarkastettu: true, paineBar: '2.1',
    painesäätimenTarkistettu: true, painesäätimenMalli: 'Danfoss WVS 22', vesiventtiiliAsetusBar: '16', lmvPuhdistettu: true, lmvKunto: 'Kunnossa',
    pumppuTarkastettu: false, mutapussiPuhdistettu: true,
  });
  const airCondenser = { ...d.createEmptyCondenserData(), tyyppi: 'erillinen_ilma', valmistaja: 'Güntner', malli: 'GVH 50', puhaltimienMaara: 2, lauhdutinPuhdistettu: true, painesäätimenTarkistettu: true, nopeussäädinMalli: 'Dixell XC', lauhdutusAsetus: '18' };
  const selectedModules = m.resolveAutoModules({ laiteTyyppi: 'vakioilmastointtikone', lauhdutinTyyppiLaite: cond, vapaajahdytysKaytossa: false, laiteKokoonpano: lk, manualModules: base.selectedModules });
  const data = {
    ...base, laiteTyyppi: 'vakioilmastointtikone', laiteTunnus: 'VIK-1', huoltoPaivamaara: '2026-11-02', kylmaaineTyyppi: 'R-410A',
    kylmaainePiireja: variant === 'nestekierto' ? '1' : '2', lauhdutinTyyppiLaite: cond, laiteKokoonpano: lk, selectedModules,
    kenttaModuulit: sparse ? sparseModules : modules,
  };
  if (variant !== 'nestekierto') data.evaporatorData = [{ ...base.evaporatorData[0], tyyppi: 'suorahoyrystin', valmistaja: 'Stulz', malli: 'CCD 200', ilmavirtaM3h: '8000' }];
  if (variant !== 'nestekierto' && !sparse) { data.kylmaainePiiri1 = circuit(1); data.kylmaainePiiri2 = circuit(2); }
  if (variant === 'dx_ilma' && !sparse) data.condenserData = [airCondenser];
  if (variant === 'dx_neste' && !sparse) data.lauhdutuspiiriData = lauhdutuspiiri;
  return h.generateMaintenanceReportHtml(data, { companyName: 'Testifirma' });
}, [variant, sparse]);
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
const common = {
  'jäähdytys/lämmitys: asetus': /Lämpötilan asetusarvo 22 °C/, 'jäähdytys/lämmitys: säätöalue': /Säätöalue \/ neutraalivyöhyke 2 K/,
  'tulo/poisto': /Tuloilma 14,5 °C.*Poistoilma 23,1 °C/, 'lämmityksen toiminta': /Lämmityksen toiminta Kunnossa/,
  'kostutus: asetusarvo': /Kostutuksen asetusarvo 50 %RH/, 'kostutus: säätöalue': /Säätöalue \/ hystereesi 5 %RH/, 'kostutus: mitattu': /Mitattu kosteus 48 %RH/,
  'kostutus: sylinteri + tunnit': /Höyrysylinterin kunto Vaihdettu.*Sylinterin käyttötunnit 2310 h/, 'kostutus: tuntilaskuri': /✓ Tuntilaskuri nollattu/,
  'kostutus: virta + letku': /Sylinterin virta 7,9 A.*Höyryletku ja kondenssi Kunnossa/, 'kostutus: johtokyky': /Veden johtokyky 420 µS\/cm/,
  'kuivaus': /Kuivauksen asetusarvo 55 %RH.*Kuivauksen toiminta Kunnossa/,
  'puhallin': /Puhaltimen tyyppi EC.*Puhaltimen virta 3,2 A.*Pyörimisnopeus \/ EC-asetus 72 % \/ rpm|Pyörimisnopeus \/ EC-asetus 72 %/, 'laakerit': /Laakerit ja kiinnitys Kunnossa/,
  'suodattimet': /Suodattimien tyyppi F7.*Suodattimen paine-ero 120 Pa.*Tukkeutumishälytys Kunnossa/, 'suodattimet vaihdettu': /✓ Suodattimet vaihdettu/,
  'kondenssivesi': /Kondenssivesi \/ vesilukko Kunnossa/, 'ohjaus': /Säädin \(valmistaja \/ malli\) Carel pCO5/, 'hälytykset kuitattu': /✓ Hälytykset kuitattu/,
  'kokoonpano: toiminnot': /Toiminnot Jäähdytys.*Lämmitys \(sähkövastukset, 6 kW\).*Kostutus \(höyrysylinteri, Carel UE018\).*Kuivaus \(3 kW\)/,
};
const water = { 'vesikenno: otsikko': /Jäähdytysvesikenno/, 'vesikenno: neste + meno/paluu': /Glykoli 30 %.*Menovesi 7 °C.*Paluuvesi 12 °C/, 'vesikenno: virtaus + paine': /Virtaus 3,1 m³\/h.*Vesipiirin paine 2,2 bar/,
  'vesikenno: venttiili + kunto': /Venttiilin ja toimilaitteen toiminta Kunnossa.*Kennon kunto Likainen/, 'vesikenno: toggles': /✓ Kenno puhdistettu.*✓ Ilmaus tehty.*✓ Likasuodatin puhdistettu/ };
const per = {
  nestekierto: { ...common, ...water, 'kokoonpano: nestekierto': /Kokoonpano Nestekiertoinen \(jäähdytysvesi\), ei kylmäainepiiriä/ },
  dx_ilma: { ...common, 'kokoonpano: dx ilma': /Kokoonpano Kylmäainepiiri \+ ilmalauhdutin.*erillinen ilmalauhdutin.*suora höyrystys/, 'piiri 1 + 2': /Kylmäainepiiri 1.*Kylmäainepiiri 2/,
    'ilmalauhdutin': /Lauhdutin 1.*Güntner.*Puhaltimien määrä 2.*Nopeussäädin Dixell XC/, 'ilmalauhdutin: kenno + paineohjaus': /✓ Kenno puhdistettu/ },
  dx_neste: { ...common, ...water, 'kokoonpano: dx neste': /Kokoonpano Kylmäainepiiri \+ nestelauhdutus.*lämmönsiirrin koneen sisällä.*suora höyrystys.*lisäksi vesikenno.*vesiventtiili: paineohjattu/,
    'piiri 1 + 2': /Kylmäainepiiri 1.*Kylmäainepiiri 2/, 'lauhdutuspiiri': /Lauhdutuspiiri/, 'lauhdutuspiiri: vesiventtiilin asetus': /Vesiventtiilin asetus 16 bar/,
    'lauhdutuspiiri: lmv': /Lämmönsiirtimen kunto Kunnossa.*✓ Lämmönsiirrin puhdistettu/ },
};
const refrigerantWords = /Vuototarkastus|Kompressori|Nestelasi|Kuivainsuodatin|Imupaine|Korkeapaine|Kylmäainepiiri \d|Höyrystin|Lauhdutin \d|Lauhdutuspiiri/;
const out = {};
for (const variant of ['nestekierto', 'dx_ilma', 'dx_neste']) {
  const html = await gen(variant, false); const t = text(html); out[variant] = html;
  if (DUMP === variant) console.log(t);
  for (const [k, re] of Object.entries(per[variant])) checks[`${variant}: ${k}`] = re.test(t);
  checks[`${variant}: ei "Valitse..."`] = !/Valitse\.\.\./.test(t);
  checks[`${variant}: ei 0,00 kW`] = !/\b0[.,]0+\s*kW/.test(t);
  checks[`${variant}: ei "Ei voida laskea"`] = !/Ei voida laskea/i.test(t);
  checks[`${variant}: ei tyhjiä lohkoja`] = !/<div class="blk"><div class="sh">[^<]*<\/div><div class="kv2"><\/div><\/div>/.test(html) && !/<div class="kv2">\s*<\/div>/.test(html);
  if (variant === 'nestekierto') checks['nestekierto: EI kylmäaine-/kompressorimoduuleja'] = !refrigerantWords.test(t);
  if (variant !== 'nestekierto') checks[`${variant}: ei ilmalauhdutinta nestelauhdutuksella tai päinvastoin`] = variant === 'dx_ilma' ? !/Lauhdutuspiiri/.test(t) : !/Lauhdutin 1/.test(t);
  if (variant === 'dx_ilma') checks['dx_ilma: ei vesikennoa (ei dual fluid)'] = !/Jäähdytysvesikenno/.test(t);
  const sp = await gen(variant, true); const st = text(sp); out[`${variant}-sparse`] = sp;
  if (DUMP === `${variant}-sparse`) console.log(st);
  checks[`${variant} sparse: kostutuksen asetusarvo`] = /Kostutuksen asetusarvo 45 %RH/.test(st);
  checks[`${variant} sparse: ei kuivausta/lämmitystä`] = !/Kuivauksen asetusarvo|Lämmityksen toiminta|Lämmitysvastusten virta/.test(st);
  checks[`${variant} sparse: ei suodatinriviä`] = !/Suodattimien tyyppi|Suodattimet vaihdettu|Puhaltimen virta/.test(st);
  checks[`${variant} sparse: ei 0,00`] = !/\b0[.,]00\b/.test(st);
  checks[`${variant} sparse: ei tyhjiä lohkoja`] = !/<div class="kv2">\s*<\/div>/.test(sp) && !/<div class="blk"><div class="sh">[^<]*<\/div><div class="kv2"><\/div><\/div>/.test(sp);
  if (PDF_DIR) {
    const names = { nestekierto: 'vik-print-sample-nestekierto', dx_ilma: 'vik-print-sample-dx-ilma', dx_neste: 'vik-print-sample-dx-neste' };
    const pg = await ctx.newPage(); await pg.setContent(html, { waitUntil: 'load' }); await pg.emulateMedia({ media: 'print' });
    await pg.pdf({ path: `${PDF_DIR}/${names[variant]}.pdf`, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  }
}
checks['ei sivuvirheitä'] = errs.length === 0;
const bad = Object.entries(checks).filter(([, v]) => !v);
console.log(Object.keys(checks).length, 'tarkistusta;', bad.length ? 'EPÄONNISTUI:' : 'KAIKKI OK', bad.map(([k]) => k), errs);
await b.close();
process.exit(bad.length ? 1 : 0);
