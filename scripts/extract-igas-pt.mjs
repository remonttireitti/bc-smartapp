/**
 * Extract text from iGas PT PDFs for manual verification / data entry.
 * Run: node scripts/extract-igas-pt.mjs
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfDir = join(__dirname, 'pt-pdf');

async function main() {
  const { PDFParse } = await import('pdf-parse');
  for (const name of readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'))) {
    const buf = readFileSync(join(pdfDir, name));
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    console.log('\n===', name, '===\n');
    console.log(result.text.slice(0, 8000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
