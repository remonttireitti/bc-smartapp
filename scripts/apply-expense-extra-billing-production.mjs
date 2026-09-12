/**
 * Aja tarvikkeiden lisälaskutussarakkeet tuotantoon (molemmat migraatiot).
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run migrate:expense-extra-billing-production
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'qvqmemeexberatbqxivw';

const migrations = [
  '20260912000100_expense_supply_extra_billing.sql',
  '20260912110000_expense_extra_billable.sql',
];

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN puuttuu.');
  console.error('Aja Supabase SQL Editorissa tiedostot:');
  for (const file of migrations) {
    console.error(`  supabase/migrations/${file}`);
  }
  process.exit(1);
}

for (const file of migrations) {
  const sql = readFileSync(resolve(__dirname, '..', 'supabase', 'migrations', file), 'utf8');
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Migraatio epäonnistui (${file}):`, response.status, body);
    process.exit(1);
  }
  console.log('OK:', file);
  if (body.trim()) console.log(body);
}

console.log('Kaikki lisälaskutussarakkeet ajettu tuotantoon.');
