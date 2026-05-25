/**
 * Lataa iGas P-T -PDF:t scripts/pt-pdf/ (tarvitaan build-refrigerant-pt.mjs:lle).
 * Run: node scripts/download-igas-pt-pdfs.mjs
 */
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { IGAS_CHART_URLS } from './igas-pt-charts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'pt-pdf');
mkdirSync(dir, { recursive: true });

const files = {
  'R134a-PT-Chart.pdf': IGAS_CHART_URLS['R-134a'],
  'R22.pdf': IGAS_CHART_URLS['R-22'],
  'R410A.pdf': IGAS_CHART_URLS['R-410A'],
  'R404A.pdf': IGAS_CHART_URLS['R-404A'],
  'R507.pdf': IGAS_CHART_URLS['R-507A'],
};

for (const [name, url] of Object.entries(files)) {
  const path = join(dir, name);
  if (existsSync(path)) {
    console.log('skip', name);
    continue;
  }
  console.log('fetch', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await import('fs').then(({ writeFileSync }) => writeFileSync(path, buf));
  console.log('wrote', name, buf.length);
}

console.log('Done. Run: node scripts/build-refrigerant-pt.mjs');
