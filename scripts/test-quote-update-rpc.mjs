import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260919123000_quote_request_update_rpc.sql'),
  'utf8',
);

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.update_quote_request/);
assert.match(migration, /can_update_quote_request/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.update_quote_request/);
assert.match(migration, /owner_company_id = public\.current_company_id\(\)/);

const helper = readFileSync(
  join(process.cwd(), 'src/lib/quoteRequest/updateQuoteRequest.ts'),
  'utf8',
);
assert.match(helper, /updateQuoteRequestViaRpc/);
assert.match(helper, /update_quote_request/);
assert.match(helper, /isMissingRpcError/);

const editPage = readFileSync(join(process.cwd(), 'src/pages/QuoteRequestEditPage.tsx'), 'utf8');
assert.match(editPage, /updateQuoteRequestViaRpc/);

console.log('test-quote-update-rpc: ok');
