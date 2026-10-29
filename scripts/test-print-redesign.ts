import assert from 'node:assert/strict';
import { fiDate, fiNumber, humanValue, normalizePrintHtml, withUnit } from '../src/lib/huoltoRaportti/printFormat';
import { blk, kvr, pair } from '../src/lib/huoltoRaportti/printKit';
import { normalizeBrandColor, renderPrintFooter, renderSignatureRow } from '../src/lib/huoltoRaportti/printShell';
import { dominantColorFromPixels } from '../src/lib/logoBrandColor';
import { generateMaintenanceReportHtml } from '../src/lib/huoltoRaportti/printHtml';
import { buildG426Report, buildTypeReport } from './print-sample-data';

// Muotoilu
assert.equal(fiDate('2026-10-29'), '29.10.2026');
assert.equal(fiDate('2026-01-05T08:30:00'), '5.1.2026 klo 08:30');
assert.equal(fiNumber('4.00'), '4,00');
assert.equal(fiNumber('1.2.3'), '1.2.3');
assert.equal(humanValue('suorakaynnistys'), 'Suorakäynnistys');
assert.equal(humanValue('kylmäkoneikko'), 'Kylmäkoneikko');
assert.equal(humanValue('huonesäädin'), 'Huonesäädin');
assert.equal(humanValue('Danfoss KP15'), 'Danfoss KP15');
assert.equal(withUnit('20', 'min'), '20\u00a0min');
assert.equal(withUnit('20 min', 'min'), '20 min');
assert.equal(withUnit('0.9', 'bar'), '0,9\u00a0bar');
assert.equal(withUnit('', 'bar'), '');
assert.equal(
  normalizePrintHtml('<style>.a{width:1.5mm}</style><p title="1.5">0.9 bar, 2026-10-29, -39.2 °C, v1.2.3</p>'),
  '<style>.a{width:1.5mm}</style><p title="1.5">0,9 bar, 29.10.2026, -39,2 °C, v1.2.3</p>',
);

// Rakennuspalikat: parit pysyvät rivillä, yksittäiset pakkautuvat, tyhjä lohko puuttuu
assert.equal(kvr('Imupaine', ''), '');
assert.match(kvr('Imupaine', '0.9', 'bar'), /0,9\u00a0bar/);
assert.equal(blk('Mittaukset', [pair(['A', ''], ['B', ''])]), '');
const pairs = blk('Mittaukset', [pair(['Ilma ennen', '4', '°C'], ['Ilma jälkeen', '0', '°C'])]);
assert.equal((pairs.match(/class="kvr/g) ?? []).length, 2, 'pari = kaksi solua samalla rivillä');
const singles = blk('Mittaukset', [pair(['A', '1'], ['B', '']), pair(['C', ''], ['D', '2'])]);
assert.ok(!/kvr pad/.test(singles), 'kaksi yksittäistä mittausta pakkautuu samalle riville ilman tyhjää');

// Brändiväri
assert.equal(normalizeBrandColor('#0b6e8a'), '#0b6e8a');
assert.equal(normalizeBrandColor('nonsense'), null);
const light = normalizeBrandColor('#ffee88')!;
assert.ok(parseInt(light.slice(1, 3), 16) < 0xe0, 'liian vaalea väri tummennetaan valkoista tekstiä varten');
const px: number[] = [];
for (let i = 0; i < 100; i++) px.push(200, 30, 30, 255);
for (let i = 0; i < 500; i++) px.push(255, 255, 255, 255);
assert.equal(dominantColorFromPixels(px)?.toLowerCase(), '#c81e1e');
assert.equal(dominantColorFromPixels(new Array(400).fill(255)), undefined);

// Alatunniste ja allekirjoitus
const foot = renderPrintFooter({ name: 'Enn "Test"', tukes: '538/91/2015', company: 'Yritys Oy', date: '29.10.2026' });
assert.match(foot, /@bottom-left\{content:"Asentaja: Enn \\"Test\\"  ·  Tukes: 538\/91\/2015  ·  Yritys Oy  ·  29\.10\.2026"/);
const sig = renderSignatureRow({ name: 'Enn', tukes: '538/91/2015', company: 'Yritys Oy', date: '29.10.2026' });
for (const label of ['Asentaja', 'Tukes-numero', 'Yritys', 'Päivämäärä', 'Allekirjoitus']) assert.ok(sig.includes(label), label);

// Koko tuloste (G426 OK01, kylmäkoneikko)
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n');
const html = generateMaintenanceReportHtml(buildG426Report(true), { companyName: 'Uudenmaan Kylmähuolto Oy', brandColor: '#0b6e8a', imageUrls: {} });
const text = visible(html);
assert.ok(!/<input|<textarea/.test(html), 'ei lomakekenttiä tulosteessa');
assert.ok(!/background:\s*#f5f5f5/.test(html), 'ei harmaita syöttölaatikoita');
assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(text), 'ei ISO-päivämääriä');
assert.ok(!/\b\d+\.\d+\b/.test(text.replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, '')), 'ei desimaalipisteitä');
assert.ok(!/Valmistajan määrä/.test(text), 'ei kömpelöä "Valmistajan määrä" -termiä');
assert.ok(!/suorakaynnistys|saadin\b/.test(text), 'ei raakoja arvoja');
assert.ok(text.includes('--brand') || html.includes('--brand:#0b6e8a'), 'brändiväri mukana');
for (const needle of ['29.10.2026', '0,9\u00a0bar', '4,00\u00a0kg', '8,56\u00a0t', '20\u00a0min', '230\u00a0V', '500\u00a0m³/h', 'Suorakäynnistys', 'Kylmäkoneikko', 'Täyttömäärä (tehdas)', 'Tukes-numero', 'Asentaja', 'Sivu']) {
  assert.ok(html.includes(needle) || /@page/.test(html) && needle === 'Sivu', `puuttuu: ${needle}`);
}
// Komponenttiryhmittely: jokaisella komponentilla Tiedot- ja Mittaukset-lohko
for (const title of ['Höyrystin 1', 'Lauhdutin 1', 'Kompressori 1', 'Kylmäainepiiri 1']) {
  const i = text.indexOf(title.replace(/\s+/g, ' '));
  assert.ok(i >= 0, title);
}
assert.ok(/Tiedot[\s\S]*Mittaukset/.test(text), 'Tiedot ennen Mittaukset');
// Parit samalla rivillä: Kosteus ennen | jälkeen peräkkäin
assert.ok(/Kosteus ennen[\s\S]{0,80}Kosteus jälkeen/.test(text));
assert.ok(/Sulatuskertoja[\s\S]{0,80}Sulatusaika/.test(text));
assert.ok(/Imupaine[\s\S]{0,60}Imulämpötila/.test(text));

// Höyrystimen Tulistus (K) ei tulostu (laskettu tulistus tulee kylmäainepiiristä)
const withTulistus = buildG426Report(false) as unknown as Record<string, any>;
withTulistus.evaporatorData[0].tulistus = '7';
const tulHtml = visible(generateMaintenanceReportHtml(withTulistus as never, { companyName: 'X', imageUrls: {} }));
const hyoIdx = tulHtml.indexOf('Höyrystin 1');
const lauIdx = tulHtml.indexOf('Lauhdutin 1');
assert.ok(hyoIdx >= 0 && lauIdx > hyoIdx);
assert.ok(!/Tulistus/.test(tulHtml.slice(hyoIdx, lauIdx)), 'ei Tulistus-riviä höyrystimessä');

// Muut tyypit rakentuvat ja käyttävät samaa kuorta (otsikkokaista, tilapillit, allekirjoituslohko)
for (const ty of ['lämpöpumppu', 'vedenjäähdytyskone', 'mlp', 'vakioilmastointtikone', 'pakastin', 'konvektorit', 'kylmäkoneikko', 'muu']) {
  const h = generateMaintenanceReportHtml(buildTypeReport(ty), { companyName: 'Yritys Oy', imageUrls: {} });
  assert.match(h, /class="hdr"/, `${ty}: otsikkokaista`);
  assert.match(h, /class="sigblock"/, `${ty}: allekirjoituslohko`);
  assert.match(h, /@bottom-left/, `${ty}: alatunniste`);
  assert.ok(!/undefined|NaN|\[object/.test(visible(h)), `${ty}: ei rikkinäisiä arvoja`);
  assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(visible(h)), `${ty}: ei ISO-päivämääriä`);
}
console.log('print redesign: ok');
