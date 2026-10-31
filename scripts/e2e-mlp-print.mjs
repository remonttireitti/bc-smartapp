// MLP-tuloste: uudet kentät näkyvät, tyhjät rivit/otsikot ja laskemattomat arvot (0,00 kW, "Ei voida laskea") jäävät pois. Ei Supabasea.
// Ajo (Playwright-kansiosta, vite käynnissä): BASE=http://localhost:5306 PDF_OUT=/workspace/mlp-print-sample.pdf node e2e-mlp-print.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5306';
const PDF_OUT = process.env.PDF_OUT || '';
const b = await chromium.launch(); const checks = {};
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
const gen = (variant) => p.evaluate(async (variant) => {
  const d = await import('/src/lib/huoltoRaportti/defaults.ts');
  const h = await import('/src/lib/huoltoRaportti/printHtml.ts');
  const base = d.createEmptyHuoltoReportData();
  const full = {
    keruupiiriTarkastusTila: 'ok', keruupiirinPaineTarkastettu: true, keruupiiriPaineBar: '1.8', keruupiirissaMutapussiPuhdistettu: true,
    keruupiirinPumppuTarkastettu: true, keruupiiriPumpunValmistaja: 'Grundfos', keruupiiriPumpunMalli: 'Alpha2 25-60', keruuPumppuNopeus: 'Auto, 70 %', keruuPumppuKunnossa: true,
    keruupiiriPumpunSyottoValinta: '230_1', keruupiiriPumppuVirta1vaihe: '0.45',
    keruuPaisuntaAstiaTarkistettu: true, keruuPaisuntaAstiaKoko: '18', keruuPaisuntaAstiaEsipaine: '1.0',
    keruupiirinEristeetKunnossa: true, keruupiirissaAutomaattinenIlmausTarkistettu: true,
    keruupiiriNeste: '3.6', keruuNestePitoisuus: '28', keruuJaatymispiste: '-15',
    keruupiiriVirtaus: '0.85', keruupiiriMeno: '1.5', keruupiiriTulo: '-1.5',
    latausTarkastusTila: 'ok', latausPaineTarkastettu: true, latausPaineBar: '1.6', latausMutapussiPuhdistettu: true,
    latausPumppuTarkastettu: true, latausPumpunValmistaja: 'Wilo', latausPumpunMalli: 'Yonos Para', latausPumppuNopeus: 'PWM 60 %', latausPumppuKunnossa: true,
    latausPaisuntaAstiaTarkistettu: true, latausPaisuntaAstiaKoko: '24', latausPaisuntaAstiaEsipaine: '1.2',
    latausVaroventtiiliTarkastettu: true, latausVaihtoventtiiliToimii: true, latausAutomaattinenIlmausTarkistettu: true,
    latausNeste: '4.18', latausVirtaus: '0.5', latausMeno: '42', latausTulo: '36',
    kayttovesiEnabled: true, kayttovesiTilavuus: '200', kayttovesiVaraajaTyyppi: 'kayttovesivaraaja', kayttovesiLampotilaAsetus: '55', kayttovesiLampotilaNykyinen: '54',
    kayttovesiSahkoVastuksetEnabled: true, kayttovesiSahkoVastuksetSijainti: 'integroitu', kayttovesiLisavastusTeho: '3', kayttovesiLisavastusToimii: true,
    kayttovesiVaroventtiiliTarkastettu: true, kayttovesiSekoitusventtiiliToimii: true, kayttovesiLegionellaKaytossa: true, kayttovesiLegionellaLampotila: '65', kayttovesiLegionellaAjastus: 'su 03:00',
    kayttovesiAnodiTarkastettu: true, kayttovesiAnodiHuomio: 'Kulunut 50 %', kayttovesiToimilaitteetOK: true,
    mittaaKokoLaiteSahko: true, kokoLaiteSahkoVaiheValinta: '3', kokoLaiteVirtaL1: '3.8', kokoLaiteVirtaL2: '3.9', kokoLaiteVirtaL3: '3.8',
  };
  const sparse = {
    // Vain osa tiedoista: ei virtauksia/lämpötiloja → ei tehoja, ei COP:ia
    keruupiirinPumppuTarkastettu: true, keruupiiriPumpunValmistaja: 'Grundfos',
    keruuPaisuntaAstiaTarkistettu: false, latausPaineTarkastettu: true,
    kayttovesiEnabled: true, kayttovesiTilavuus: '200',
    keruupiiriVirtaus: '0.85',
  };
  const mlp = d.ensureMlpData(variant === 'full' ? full : sparse);
  const data = { ...base, laiteTyyppi: 'mlp', laiteTunnus: 'MLP-1', huoltoPaivamaara: '2026-10-30', kylmaaineTyyppi: 'R-410A',
    selectedModules: { ...base.selectedModules, mlpPiirit: true }, mlpData: mlp };
  return h.generateMaintenanceReportHtml(data, { companyName: 'Testifirma' });
}, variant);
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');
const full = await gen('full'); const ft = text(full);
for (const [k, re] of Object.entries({
  'keruu: nopeus/asetus': /Nopeus \/ asetus Auto, 70 %/, 'keruu: pumppu kunnossa': /✓ Pumppu kunnossa/, 'keruu: piirin paine 1,8 bar': /Piirin paine 1,8 bar/,
  'keruu: paisunta koko+esipaine': /Koko 18 l/, 'keruu: pitoisuus + jäätymispiste': /Pitoisuus 28 %.*Jäätymispiste -15 °C/, 'keruu: suodatin': /✓ Suodatin puhdistettu/,
  'keruu: meno/paluu': /Meno 1,5 °C.*Paluu -1,5 °C/, 'keruu: virtaus': /Virtaus 0,85 l\/s · 3,1 m³\/h/,
  'lataus: varoventtiili': /✓ Varoventtiili tarkastettu/, 'lataus: vaihtoventtiili': /✓ Vaihtoventtiilin toiminta OK/, 'lataus: järjestelmän paine': /Järjestelmän paine 1,6 bar/, 'lataus: latauspumppu': /Latauspumppu/,
  'kv: varaajan koko': /Varaajan koko 200 l/, 'kv: tyyppi': /Tyyppi Käyttövesivaraaja/, 'kv: lisävastus kW': /Lisävastuksen teho 3 kW/, 'kv: legionella': /Legionella-asetus 65 °C · su 03:00/,
  'kv: sekoitusventtiili': /✓ Sekoitusventtiilin toiminta OK/, 'kv: anodi': /✓ Anodi tarkastettu/, 'kv: anodin kunto': /Anodin kunto Kulunut 50 %/, 'kv: varoventtiili': /Käyttövesi.*✓ Varoventtiili tarkastettu/,
  'energia: lataus teho 12,54 kW': /Latauspiirin teho 12,54 kW/, 'energia: sähköteho': /Sähköteho 2,27 kW/, 'energia: COP': /COP 5,54/,
})) checks[k] = re.test(ft);
checks['ei 0,00 kW'] = !/0,00\s*kW/.test(ft);
const sparse = await gen('sparse'); const st = text(sparse);
checks['sparse: ei 0,00 kW'] = !/0[.,]00\s*kW/.test(st);
checks['sparse: ei "Ei voida laskea"'] = !/Ei voida laskea|ei voida laskea/.test(st);
checks['sparse: ei COP-luentoa'] = !/COP:N LASKEMISEKSI|laskemiseksi tarvitaan|Oikea COP-laskenta/i.test(st);
checks['sparse: ei punaista COP-laatikkoa'] = !/ff6d00|ffebee/i.test(sparse);
checks['sparse: ei tyhjiä arvoja (– / -)'] = !/ [-–—] (?:°C|bar|l\/s|kW|l) /.test(st);
checks['sparse: pumppu näkyy'] = /Grundfos/.test(st);
checks['sparse: paisunta-astia pois'] = !/Paisunta-astia/.test(st);
checks['sparse: energiaosio vain lyhyt COP-rivi tai ei lainkaan'] = !/Energiatehokkuus/.test(st) || /COP: [^.]* puuttuu\./.test(st);
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
