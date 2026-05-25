/**
 * Parse iGas PT PDF text → [tempC, psig] points (psig > 7 = gauge, skip inHg vacuum).
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfDir = join(__dirname, 'pt-pdf');

function parsePoints(text, label) {
  const points = new Map();
  const add = (tempC, psig) => {
    if (!Number.isFinite(tempC) || !Number.isFinite(psig)) return;
    if (psig < 7) return; // inHg vacuum / below gauge zero
    if (tempC < -60 || tempC > 80) return;
    const key = Math.round(tempC * 10) / 10;
    if (!points.has(key)) points.set(key, psig);
  };

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    if (parts.length >= 6) {
      // Block B: °C, °F, psig
      add(parts[3], parts[5]);
    }
    if (parts.length >= 9) {
      // Block C: °F, °C — psig often in footer; skip if only 2 temps
    }
    if (parts.length === 4) {
      // Footer style: psig, °C, °F, psig
      add(parts[1], parts[0]);
      add(parts[1], parts[3]);
    }
  }

  const sorted = [...points.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, p]) => [t, Math.round(p * 10) / 10]);

  console.log(`\n${label}: ${sorted.length} points`);
  console.log(sorted.map(([t, p]) => `  [${t}, ${p}],`).join('\n'));
  return sorted;
}

async function main() {
  const { PDFParse } = await import('pdf-parse');
  const out = {};

  for (const name of readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'))) {
    const buf = readFileSync(join(pdfDir, name));
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    const key = name.replace('.pdf', '').replace('R', 'R-');
    if (name.startsWith('R404') || name.startsWith('R410')) {
      out[key] = { raw: result.text.slice(0, 15000) };
      console.log('\n===', name, '(zeotropic – inspect raw) ===');
      console.log(result.text.slice(0, 6000));
    } else {
      out[key] = parsePoints(result.text, key);
    }
  }

  writeFileSync(join(__dirname, 'igas-pt-extracted.json'), JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
