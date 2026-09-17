import assert from 'node:assert/strict';
import { canDeleteQuoteRequest } from '../src/lib/deletePermissions.ts';
import { QUOTE_DELETE_DENIED_MESSAGE } from '../src/lib/deleteQuoteRequest.ts';
import { QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE } from '../src/lib/revertQuoteRequestToDraft.ts';

assert.equal(
  QUOTE_DELETE_DENIED_MESSAGE,
  'Tarjouksen poisto epäonnistui — tarkista oikeudet.',
);
assert.equal(
  QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE,
  'Palautus luonnokseksi epäonnistui — tarkista oikeudet.',
);

assert.equal(
  canDeleteQuoteRequest(
    { status: 'sent', owner_company_id: 'owner', created_by_company_id: 'owner' },
    'owner',
    'manager',
  ),
  true,
);
assert.equal(
  canDeleteQuoteRequest(
    { status: 'ordered', owner_company_id: 'owner', created_by_company_id: 'owner' },
    'owner',
    'manager',
  ),
  false,
);

console.log('test-delete-quote-request: ok');
