import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEmptyMittausSisayksikkoData } from '../src/lib/huoltoRaportti/defaults.ts';
import {
  calculateIlpSisayksikkoTeho,
  formatIlpSisayksikkoTeho,
} from '../src/lib/huoltoRaportti/ilpTeho.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const m = (patch) => ({ ...createEmptyMittausSisayksikkoData(), ...patch });

test('sensible heating: 600 m³/h, ΔT 20 K → 0,1667 × 1,2 × 1,005 × 20 = 4,02 kW', () => {
  const t = calculateIlpSisayksikkoTeho(
    m({ paluuLampotilaLammitys: '21', puhallusLampotilaLammitys: '41', ilmanmaaraM3hLammitys: '600' }),
    'lammitys',
  );
  assert.equal(t.method, 'naytto');
  near(t.kw, (600 / 3600) * 1.2 * 1.005 * 20, 1e-9);
  near(t.kw, 4.02);
  assert.equal(t.cooling, false);
  assert.equal(formatIlpSisayksikkoTeho(t, 'lammitys'), '4,02 kW');
});

test('sensible cooling: 450 m³/h, 26 → 15 °C → 1,66 kW', () => {
  const t = calculateIlpSisayksikkoTeho(
    m({ paluuLampotilaJaahdytys: '26', puhallusLampotilaJaahdytys: '15', ilmanmaaraM3hJaahdytys: '450' }),
    'jaahdytys',
  );
  near(t.kw, 0.125 * 1.206 * 11, 1e-9); // 1,658
  assert.equal(formatIlpSisayksikkoTeho(t, 'jaahdytys'), '1,66 kW');
});

test('enthalpy cooling with RH: 600 m³/h, 27 °C/50 % → 14 °C/90 % ≈ 3,78 kW, latent ≈ 1,16 kW', () => {
  // h = 1,006·t + x·(2501 + 1,86·t); x = 0,622·pw/(p−pw); pws Magnus; p = 101 325 Pa
  // h(27/50) ≈ 55,59 kJ/kg, h(14/90) ≈ 36,71 kJ/kg, Δh ≈ 18,88 → P = 0,1667 × 1,2 × 18,88 ≈ 3,78 kW
  const t = calculateIlpSisayksikkoTeho(
    m({
      paluuLampotilaJaahdytys: '27', paluuKosteusRhJaahdytys: '50',
      puhallusLampotilaJaahdytys: '14', puhallusKosteusRhJaahdytys: '90',
      ilmanmaaraM3hJaahdytys: '600',
    }),
    'jaahdytys',
  );
  assert.equal(t.method, 'entalpia');
  near(t.kw, 3.775, 0.01);
  near(t.sensibleKw, 2.613, 0.005);
  near(t.latentKw, 1.162, 0.01);
  assert.equal(formatIlpSisayksikkoTeho(t, 'jaahdytys'), '3,78 kW (kuivaus 1,16 kW)');
});

test('only one RH given → sensible fallback', () => {
  const t = calculateIlpSisayksikkoTeho(
    m({ paluuLampotilaJaahdytys: '27', paluuKosteusRhJaahdytys: '50', puhallusLampotilaJaahdytys: '14', ilmanmaaraM3hJaahdytys: '600' }),
    'jaahdytys',
  );
  assert.equal(t.method, 'naytto');
  near(t.kw, 2.613, 0.005);
});

test('room temp used when return air missing; comma decimals', () => {
  const t = calculateIlpSisayksikkoTeho(
    m({ sisalampotilaLammitys: '21,5', puhallusLampotilaLammitys: '45,5', ilmanmaaraM3hLammitys: '500' }),
    'lammitys',
  );
  near(t.kw, (500 / 3600) * 1.206 * 24, 1e-9);
});

test('no airflow → no power; direction mismatch flagged', () => {
  assert.equal(calculateIlpSisayksikkoTeho(m({ paluuLampotilaLammitys: '21', puhallusLampotilaLammitys: '41' }), 'lammitys'), null);
  const t = calculateIlpSisayksikkoTeho(
    m({ paluuLampotilaJaahdytys: '21', puhallusLampotilaJaahdytys: '41', ilmanmaaraM3hJaahdytys: '600' }),
    'jaahdytys',
  );
  assert.equal(formatIlpSisayksikkoTeho(t, 'jaahdytys'), '4,02 kW (ilma lämpeni)');
});

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && /(^|\\/)supabase(\\.ts)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/')) {
    return { url: 'data:text/javascript,export const supabase = {};', shortCircuit: true };
  }
  return next(spec, ctx);
}`));
const { generateKonvektoritGridPrintHtml } = await import('../src/lib/huoltoRaportti/konvektoriPrint.ts');
const { PRINT_SHELL_CSS } = await import('../src/lib/huoltoRaportti/printShell.ts');
const { generateIlpPrintHtml } = await import('../src/lib/huoltoRaportti/ilpPrint.ts');
const { createEmptyHuoltoReportData } = await import('../src/lib/huoltoRaportti/defaults.ts');

test('ILP print: indoor units tinted, power row and RH shown', () => {
  const data = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'lämpöpumppu',
    sisayksikkoMaara: 1,
    mittausLammitysTestattu: true,
    mittausSisayksikot: [m({
      paluuLampotilaLammitys: '21', puhallusLampotilaLammitys: '41', ilmanmaaraM3hLammitys: '600',
      paluuKosteusRhLammitys: '40',
    })],
  };
  const html = generateIlpPrintHtml(data, { companyName: 'X', docTitle: 'Huoltopöytäkirja', fault: false });
  assert.match(html, /class="sec tint"/);
  assert.match(html, /<tr class="teho"><th>Teho<\/th><td>4,02 kW<\/td><\/tr>/);
  assert.match(html, /Kosteus paluu<\/th><td>40 %/);
});

test('Konvektori print: grid outside grey legacy wrapper, tinted, colour image', () => {
  const grid = generateKonvektoritGridPrintHtml([{ tunnus: 'K-1', tyyppi: 'seina', suodatinPuhdistettu: true }], (v) => String(v ?? ''), { origin: '' });
  assert.match(grid, /^\s*<section class="sec tint konvektorit">\s*<h2>Konvektorit<\/h2>/);
  assert.ok(!PRINT_SHELL_CSS.includes('img[src*="/assets/konvektorit/"] { filter: grayscale'));
  const src = readFileSync(new URL('../src/lib/huoltoRaportti/printHtml.ts', import.meta.url), 'utf8');
  assert.match(src, /<\/div>\n  \$\{renderKonvektoritTable\(data\)\}\n  <div class="legacy">/);
});
