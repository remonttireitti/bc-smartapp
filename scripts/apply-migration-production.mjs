/**
 * Aja yksi migraatio tuotannon Supabaseen.
 *
 * Vaihtoehto A (suositus, jos CLI kirjautunut):
 *   npm run db:login
 *   npm run db:link
 *   npm run db:push
 *
 * Vaihtoehto B (Management API):
 *   SUPABASE_ACCESS_TOKEN=... npm run migrate:production -- 20260630000122_daily_log_customer_extra_beyond_quote.sql
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'qvqmemeexberatbqxivw';

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error('Käyttö: npm run migrate:production -- <migraatiotiedosto.sql>');
  process.exit(1);
}

const migrationPath = resolve(__dirname, '..', 'supabase', 'migrations', migrationArg);
const sql = readFileSync(migrationPath, 'utf8');
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN puuttuu.');
  console.error('Hae token: https://supabase.com/dashboard/account/tokens');
  console.error('Tai aja Studiossa SQL Editorissa:\n');
  console.error(sql);
  process.exit(1);
}

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
  console.error('Migraatio epäonnistui:', response.status, body);
  process.exit(1);
}

console.log('Migraatio ajettu onnistuneesti:', migrationArg);
if (body.trim()) console.log(body);
