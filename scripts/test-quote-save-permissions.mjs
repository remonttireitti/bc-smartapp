import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260919120000_quote_requests_update_write_module.sql'),
  'utf8',
);

assert.match(migration, /quote_requests_update/);
assert.match(migration, /can_write_module\(owner_company_id,\s*'quotes'\)/);
assert.match(migration, /WITH CHECK/);
assert.match(migration, /can_read_customer/);
assert.doesNotMatch(
  migration,
  /created_by_company_id\s*=\s*public\.current_company_id\(\)/,
);

const editPage = readFileSync(join(process.cwd(), 'src/pages/QuoteRequestEditPage.tsx'), 'utf8');
assert.match(editPage, /Älä ylikirjoita created_by_company_id/);
assert.match(editPage, /created_by_company_id: profile\.company_id/);
assert.match(editPage, /ei kirjoitusoikeutta tähän tarjoukseen/);
// Update path must not set created_by_company_id inside the shared rowPayload.
const updateBlock = editPage.slice(
  editPage.indexOf('const rowPayload = {'),
  editPage.indexOf('if (quoteId)'),
);
assert.doesNotMatch(updateBlock, /created_by_company_id:/);

console.log('test-quote-save-permissions: ok');
