/**
 * Generoi BC Smartapp käyttöohje-PDF.
 * Aja: npm run docs:pdf
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const script = resolve(__dirname, 'generate-user-guide-pdf.py');
const output = resolve(root, 'public/BC-Smartapp-kayttoohje.pdf');

execSync(`python "${script}"`, { stdio: 'inherit', cwd: root });

if (!existsSync(output)) {
  console.error('PDF-generointi epäonnistui');
  process.exit(1);
}
