import assert from 'node:assert/strict';
import { QUOTE_STATUS_LABELS, isQuoteOrderedStatus } from '../src/lib/quoteRequest/defaults.ts';
import {
  buildWorkReportDescriptionFromQuote,
  buildWorkReportPayloadFromQuote,
} from '../src/lib/quoteRequest/createWorkReportFromQuote.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';

assert.equal(QUOTE_STATUS_LABELS.ordered, 'Tilattu');
assert.equal(isQuoteOrderedStatus('ordered'), true);
assert.equal(isQuoteOrderedStatus('sent'), false);

const data = createEmptyQuoteRequestData('huolto');
data.faultDescription = 'Kompressori rikki';
data.customerContactPerson = 'Matti Meikäläinen';

const payload = buildWorkReportPayloadFromQuote({
  quote: {
    id: 'quote-1',
    title: 'Messukeskus – Tarjous',
    data,
    customer_id: 'cust-1',
    equipment_id: 'eq-1',
    owner_company_id: 'owner-1',
    created_by_company_id: 'creator-1',
    branding_company_id: 'owner-1',
    partnership_id: null,
    subscriber_id: null,
  },
  customer: { name: 'Messukeskus', address: 'Messuaukio 1', city: 'Helsinki' },
  sessionUserId: 'user-1',
});

assert.equal(payload.description, 'Kompressori rikki');
assert.equal(payload.orderer_name, 'Matti Meikäläinen');
assert.equal(payload.location_text, 'Messuaukio 1, Helsinki');
assert.equal(payload.status, 'draft');
assert.equal(payload.customer_id, 'cust-1');
assert.equal(buildWorkReportDescriptionFromQuote(data), 'Kompressori rikki');

console.log('test-quote-ordered-status: ok');
