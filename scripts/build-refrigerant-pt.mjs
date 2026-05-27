/**
 * Generates src/lib/huoltoRaportti/refrigerantPtData.ts
 * iGas PDFs: scripts/pt-pdf/*.pdf (download from igasusa.com/files/*-PT-Chart.pdf)
 * Run: node scripts/build-refrigerant-pt.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadIgasPtFromPdfs, psigToBar, IGAS_CHART_URLS } from './igas-pt-charts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../src/lib/huoltoRaportti/refrigerantPtData.ts');

/** Muut aineet — ei vielä iGas-PDF:tä repossa */
const FALLBACK_SINGLE_PSIG = {
  'R-32': [
    [-40, 6.1], [-35, 9.5], [-30, 13.4], [-25, 17.7], [-20, 22.6], [-15, 28.0], [-10, 34.0],
    [-5, 40.6], [0, 47.8], [5, 55.6], [10, 64.1], [15, 73.2], [20, 83.0], [25, 93.5], [30, 104.8],
    [35, 116.8], [40, 129.6], [45, 143.2], [50, 157.6], [55, 172.8], [60, 189.0], [65, 206.1],
    [70, 224.2], [75, 243.2], [80, 263.3], [85, 284.4], [90, 306.5], [95, 329.7], [100, 354.0],
    [105, 379.5], [110, 406.1], [115, 434.0], [120, 463.1], [125, 493.5], [130, 525.2],
    [135, 558.3], [140, 592.8], [145, 628.7], [150, 666.1],
  ],
  'R-600a': [
    [10, 0.7], [15, 2.5], [20, 4.4], [25, 6.5], [30, 8.8], [35, 11.2], [40, 13.8], [45, 16.6],
    [50, 19.6], [55, 22.8], [60, 26.2], [65, 29.8], [70, 33.6], [75, 37.7], [80, 42.0],
    [85, 46.5], [90, 51.3], [95, 56.3], [100, 61.6], [105, 67.2], [110, 73.1], [115, 79.3],
    [120, 85.7], [125, 92.5], [130, 99.6],
  ],
  'R-290': [
    [-40, 0.03], [-28, 6.6], [-24, 8.6], [-20, 10.7], [-16, 13.0], [-12, 15.5], [-8, 18.1],
    [-4, 20.8], [0, 23.7], [4, 26.9], [8, 30.2], [12, 33.6], [16, 37.7], [20, 41.2], [24, 45.3],
    [28, 49.7], [32, 54.4], [36, 59.0], [40, 64.1], [44, 69.4], [48, 74.9], [52, 80.8],
    [56, 86.8], [60, 93.2], [64, 99.9], [68, 106.9], [72, 114.1], [76, 121.7], [80, 129.6],
    [84, 137.9], [88, 146.5], [92, 164.7], [96, 164.7], [100, 174.3], [120, 228.4],
  ],
  'R-449A': [
    [-40, 9], [-35, 12], [-30, 15], [-25, 19], [-20, 23], [-15, 27], [-10, 32], [-5, 37],
    [0, 43], [5, 49], [10, 56], [15, 63], [20, 70], [25, 78], [30, 87], [35, 96], [40, 106],
    [45, 116], [50, 127], [55, 138], [60, 150], [65, 163], [70, 176],
  ],
  'R-1234yf': [
    [-40, 4.2], [-30, 7.8], [-20, 12.5], [-10, 18.2], [0, 25.0], [10, 33.0], [20, 42.5],
    [30, 53.5], [40, 66.0], [50, 80.0], [60, 96.0], [70, 114.0], [80, 134.0], [90, 156.0],
    [100, 181.0], [110, 208.0], [120, 238.0],
  ],
  'R-717': [
    [-40, -3.5], [-30, -0.5], [-20, 2.5], [-10, 6.0], [0, 10.5], [10, 16.0], [20, 23.0],
    [30, 31.5], [40, 41.5], [50, 53.5], [60, 68.0],
  ],
};

/** R-407C (°C, bar gauge) — Honeywell/Arkema + CAREL EVD -kalibrointipisteet */
const R407C_BAR = {
  bubble: [
    [-25, 1.95], [-20, 2.45], [-15, 3.0], [-10, 3.6], [-5, 4.25],
    [0, 4.95], [2.6, 4.7], [5.8, 5.2], [10, 5.75], [15, 6.5],
    [20, 7.3], [25, 8.15], [30, 9.05], [35, 10.0], [40, 11.0],
    [45, 12.05], [50, 13.15], [55, 14.3], [60, 15.5], [65, 16.75], [70, 18.05],
  ],
  dew: [
    [-25, 1.6], [-20, 2.05], [-15, 2.55], [-10, 3.1], [-5, 3.7],
    [0, 4.35], [2.6, 4.1], [5.8, 4.6], [10, 5.15], [15, 5.85],
    [20, 6.6], [25, 7.4], [30, 8.25], [35, 9.15], [40, 10.1],
    [45, 11.1], [50, 12.15], [55, 13.25], [60, 14.4], [65, 15.6], [70, 16.85],
  ],
};

const ALIASES = {
  'R-407F': 'R-407C',
  'R-407B': 'R-407C',
  'R-507A': 'R-404A',
  'R-508B': 'R-404A',
  'R-402A': 'R-404A',
  'R-402B': 'R-404A',
  'R-408A': 'R-404A',
  'R-409A': 'R-404A',
  'R-422A': 'R-404A',
  'R-422D': 'R-404A',
  'R-427A': 'R-407C',
  'R-434A': 'R-407C',
  'R-437A': 'R-407C',
  'R-438A': 'R-404A',
  'R-442A': 'R-404A',
  'R-448A': 'R-404A',
  'R-452A': 'R-404A',
  'R-453A': 'R-404A',
  'R-458A': 'R-404A',
  'R-463A': 'R-404A',
  'R-464A': 'R-404A',
  'R-465A': 'R-404A',
  'R-466A': 'R-404A',
  'R-467A': 'R-404A',
  'R-468A': 'R-404A',
  'R-469A': 'R-404A',
  'R-470A': 'R-404A',
  'R-471A': 'R-404A',
  'R-472A': 'R-404A',
  'R-473A': 'R-404A',
  'R-474A': 'R-404A',
  'R-475A': 'R-404A',
  'R-476A': 'R-404A',
  'R-477A': 'R-404A',
  'R-478A': 'R-404A',
  'R-479A': 'R-404A',
  'R-480A': 'R-404A',
  'R-454B': 'R-410A',
  'R-454C': 'R-410A',
  'R-455A': 'R-410A',
  'R-134A': 'R-134a',
  'R-513A': 'R-134a',
  'R-1234ze': 'R-1234yf',
  'R-417A': 'R-407C',
  'ISCEON 59': 'R-407C',
  'R-1270': 'R-290',
};

function fmtRows(name, rows) {
  const lines = rows.map(([t, p]) => `      [${t}, ${p}],`).join('\n');
  return `    '${name}': [\n${lines}\n    ],`;
}

function fmtZeotropePsig(name, { bubble, dew }) {
  return `    '${name}': {\n      bubble: [\n${bubble.map(([t, p]) => `        [${t}, ${p}],`).join('\n')}\n      ],\n      dew: [\n${dew.map(([t, p]) => `        [${t}, ${p}],`).join('\n')}\n      ],\n    },`;
}

function fmtZeotropeBar(name, { bubble, dew }) {
  return `    '${name}': {\n      bubble: [\n${bubble.map(([t, b]) => `        [${t}, ${b}],`).join('\n')}\n      ],\n      dew: [\n${dew.map(([t, b]) => `        [${t}, ${b}],`).join('\n')}\n      ],\n    },`;
}

const igas = await loadIgasPtFromPdfs();

const SINGLE_PSIG = {
  'R-134a': igas['R-134a'].psig,
  'R-22': igas['R-22'].psig,
  ...FALLBACK_SINGLE_PSIG,
};

const ZEOTROPIC_PSIG = {
  'R-410A': { bubble: igas['R-410A'].bubble, dew: igas['R-410A'].dew },
  'R-404A': { bubble: igas['R-404A'].bubble, dew: igas['R-404A'].dew },
};

const SINGLE_BAR = {
  'R-134a': psigToBar(SINGLE_PSIG['R-134a']),
  'R-22': psigToBar(SINGLE_PSIG['R-22']),
};

const ZEOTROPIC_BAR = {
  'R-410A': {
    bubble: psigToBar(ZEOTROPIC_PSIG['R-410A'].bubble),
    dew: psigToBar(ZEOTROPIC_PSIG['R-410A'].dew),
  },
  'R-404A': {
    bubble: psigToBar(ZEOTROPIC_PSIG['R-404A'].bubble),
    dew: psigToBar(ZEOTROPIC_PSIG['R-404A'].dew),
  },
  'R-407C': R407C_BAR,
};

let out = `/** Auto-generated by scripts/build-refrigerant-pt.mjs — do not edit by hand. */\n`;
out += `/** iGas P-T: https://www.igasusa.com/products/refrigerants */\n\n`;
out += `export type PsigTempRow = readonly [tempC: number, psig: number];\n`;
out += `export type BarTempRow = readonly [tempC: number, barGauge: number];\n\n`;
out += `export const REFRIGERANT_PT_CHART_URLS: Record<string, string> = ${JSON.stringify(IGAS_CHART_URLS, null, 2)};\n\n`;
out += `export const REFRIGERANT_PT_PSIG: Record<string, readonly PsigTempRow[]> = {\n`;
out += Object.entries(SINGLE_PSIG).map(([k, v]) => fmtRows(k, v)).join('\n');
out += `\n};\n\n`;
out += `export const REFRIGERANT_PT_ZEOTROPIC_PSIG: Record<\n  string,\n  { bubble: readonly PsigTempRow[]; dew: readonly PsigTempRow[] }\n> = {\n`;
out += Object.entries(ZEOTROPIC_PSIG).map(([k, v]) => fmtZeotropePsig(k, v)).join('\n');
out += `\n};\n\n`;
out += `export const REFRIGERANT_PT_BAR: Record<string, readonly BarTempRow[]> = {\n`;
out += Object.entries(SINGLE_BAR).map(([k, v]) => fmtRows(k, v)).join('\n');
out += `\n};\n\n`;
out += `export const REFRIGERANT_PT_ZEOTROPIC_BAR: Record<\n  string,\n  { bubble: readonly BarTempRow[]; dew: readonly BarTempRow[] }\n> = {\n`;
out += Object.entries(ZEOTROPIC_BAR).map(([k, v]) => fmtZeotropeBar(k, v)).join('\n');
out += `\n};\n\n`;
out += `export const REFRIGERANT_PT_ALIASES: Record<string, string> = ${JSON.stringify(ALIASES, null, 2)};\n`;

writeFileSync(OUT, out, 'utf8');
console.log('Wrote', OUT);
console.log(
  'iGas points:',
  Object.keys(SINGLE_PSIG).filter((k) => ['R-134a', 'R-22'].includes(k)).map((k) => `${k}:${SINGLE_PSIG[k].length}`).join(', '),
  '| zeotropic R-410A/R-404A:',
  ZEOTROPIC_PSIG['R-410A'].dew.length,
);
