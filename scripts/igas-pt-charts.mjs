/**
 * iGas USA P-T chart data extracted from PDFs (scripts/pt-pdf/*.pdf).
 * @see https://www.igasusa.com/products/refrigerants
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfDir = join(__dirname, 'pt-pdf');

const PSIG_TO_BAR = 0.06894757293178306;

function fToC(f) {
  return Math.round(((f - 32) * (5 / 9)) * 10) / 10;
}

function dedupeSort(rows) {
  const seen = new Set();
  const out = [];
  for (const [t, p] of rows) {
    if (!Number.isFinite(t) || !Number.isFinite(p) || p < 7) continue;
    const rt = Math.round(t * 10) / 10;
    const rp = Math.round(p * 10) / 10;
    const key = `${rt}|${rp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([rt, rp]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function parseSingleR22(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    if (p.length >= 6 && p[5] >= 7 && p[5] < 45 && p[3] > -25 && p[3] < 20 && p[4] > 30) {
      rows.push([p[3], p[5]]);
    }
    if (p.length === 4 && p[0] >= 50 && p[0] < 400 && p[1] > 15 && p[1] < 70) {
      rows.push([p[1], p[0]]);
    }
  }
  return dedupeSort(rows);
}

/** iGas zeotropic PDF: block D has °C, psig, then duplicate pressures in kPa — never use kPa as psig. */
function isLikelyKpaNotPsig(psigCol, altCol) {
  return altCol >= 150 && altCol > psigCol * 2;
}

/** Block C P_liq column is kPa (~1.55–1.72× psig), not true high-side psig (~1.8×+). */
function isBlockCLiqKpaColumn(psigCol, liqCol) {
  if (!(psigCol >= 7) || !(liqCol >= 7)) return false;
  const ratio = liqCol / psigCol;
  return liqCol > psigCol * 1.3 && liqCol < psigCol * 1.75;
}

function parseZeotropic(text) {
  const bubble = [];
  const dew = [];
  for (const line of text.split('\n')) {
    const n = line.trim().split(/\s+/).map(Number).filter((x) => !Number.isNaN(x));
    if (n.length < 11) continue;
    const tempC = n.length >= 13 && n[11] > -50 && n[11] < 70 ? n[11] : null;
    // Block C: high-side P_liq/P_vap (psig) — use n[11] as °C, not n[7] (different table column).
    if (
      tempC != null &&
      n[9] >= 7 &&
      n[10] >= 7 &&
      n[9] < 400 &&
      n[10] < 400 &&
      n[9] > 180 &&
      !(n.length >= 13 && isBlockCLiqKpaColumn(n[12], n[9]))
    ) {
      bubble.push([tempC, n[9]]);
      dew.push([tempC, n[10]]);
    }
    // Block D: °C + psig (n[12]); n[13]/n[14] are kPa — do not use as psig.
    if (tempC != null && n[12] >= 7 && n[12] < 400) {
      const psig = n[12];
      if (n.length >= 15 && n[13] >= 7 && isLikelyKpaNotPsig(psig, n[13])) {
        bubble.push([tempC, psig]);
        dew.push([tempC, psig]);
      } else if (n.length >= 15 && n[13] < 250 && n[14] < 250) {
        bubble.push([tempC, n[13]]);
        dew.push([tempC, n[14]]);
      }
    }
  }
  return { bubble: dedupeSort(bubble), dew: dedupeSort(dew) };
}

/** R-134a — iGas PDF (hand-checked sample rows from chart). */
export const R134A_PSIG = [
  [-17.2, 7.0], [-11.7, 11.9], [-6.1, 17.3], [-1.7, 25.3], [3.9, 33.1], [10.6, 46.6],
  [16.1, 56.9], [21.7, 71.1], [26.1, 85.0], [31.7, 102.5], [38.3, 126.3], [43.9, 149.8],
  [49.4, 176.9], [53.9, 195.8],
];

export async function loadIgasPtFromPdfs() {
  const { PDFParse } = await import('pdf-parse');
  const out = {
    'R-134a': { type: 'single', psig: R134A_PSIG },
    'R-22': { type: 'single', psig: [] },
    'R-410A': { type: 'zeotropic', bubble: [], dew: [] },
    'R-404A': { type: 'zeotropic', bubble: [], dew: [] },
  };

  for (const file of readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'))) {
    const buf = readFileSync(join(pdfDir, file));
    const parser = new PDFParse({ data: buf });
    const text = (await parser.getText()).text;
    if (file === 'R22.pdf') {
      out['R-22'].psig = parseSingleR22(text);
    } else if (file === 'R410A.pdf') {
      const z = parseZeotropic(text);
      out['R-410A'] = { type: 'zeotropic', ...z };
    } else if (file === 'R404A.pdf') {
      const z = parseZeotropic(text);
      out['R-404A'] = { type: 'zeotropic', ...z };
    }
  }
  return out;
}

export function psigToBar(rows) {
  return rows.map(([t, psig]) => [t, Math.round(psig * PSIG_TO_BAR * 1000) / 1000]);
}

export const IGAS_CHART_URLS = {
  'R-134a': 'https://www.igasusa.com/files/R134a-PT-Chart.pdf',
  'R-22': 'https://www.igasusa.com/files/R22-PT-Chart.pdf',
  'R-410A': 'https://www.igasusa.com/files/R410A-PT-Chart.pdf',
  'R-404A': 'https://www.igasusa.com/files/R404A-PT-Chart.pdf',
  'R-507A': 'https://www.igasusa.com/files/R507-PT-Chart.pdf',
};

if (process.argv[1]?.includes('igas-pt-charts')) {
  const data = await loadIgasPtFromPdfs();
  console.log(JSON.stringify(data, null, 2));
}
