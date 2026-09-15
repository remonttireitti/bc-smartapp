import assert from 'node:assert/strict';
import { QUOTE_STATUS_LABELS, isQuoteOrderedStatus } from '../src/lib/quoteRequest/defaults.ts';
import {
  buildWorkReportDescriptionFromQuote,
  buildWorkReportHeadingFromQuote,
  buildWorkReportPayloadFromQuote,
} from '../src/lib/quoteRequest/createWorkReportFromQuote.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import {
  QUOTE_AUTO_WORK_REPORT_FROM_MS,
  shouldAutoCreateWorkReportOnOrder,
} from '../src/lib/quoteRequest/orderedWorkReport.ts';

assert.equal(QUOTE_STATUS_LABELS.ordered, 'Tilattu');
assert.equal(isQuoteOrderedStatus('ordered'), true);
assert.equal(isQuoteOrderedStatus('sent'), false);

assert.equal(shouldAutoCreateWorkReportOnOrder('2026-09-13T23:59:59+03:00'), false);
assert.equal(shouldAutoCreateWorkReportOnOrder('2026-09-14T00:00:00+03:00'), true);
assert.equal(shouldAutoCreateWorkReportOnOrder('2026-09-15T10:00:00+03:00'), true);
assert.equal(shouldAutoCreateWorkReportOnOrder(null), false);
assert.ok(QUOTE_AUTO_WORK_REPORT_FROM_MS > 0);

const data = createEmptyQuoteRequestData('huolto');
data.introText = 'Vanha jäähdytysyksikköön kompressori rikki';
data.faultDescription =
  'Tarjotaan teille seuraavasti: Uuden ilmalämpöpumpun asennus vanhan laitteen tilalle.';

const payload = buildWorkReportPayloadFromQuote({
  quote: {
    id: 'quote-1',
    title: 'Messukeskus – Tarjous',
    data,
    customer_id: 'cust-1',
    owner_company_id: 'owner-1',
    created_by_company_id: 'creator-1',
    branding_company_id: 'owner-1',
    partnership_id: null,
    subscriber_id: null,
  },
  customer: { name: 'Messukeskus' },
  sessionUserId: 'user-1',
});

assert.equal(payload.heading, 'Vanha jäähdytysyksikköön kompressori rikki');
assert.equal(
  payload.description,
  'Tarjotaan teille seuraavasti: Uuden ilmalämpöpumpun asennus vanhan laitteen tilalle.',
);
assert.equal(payload.title, 'Messukeskus – Vanha jäähdytysyksikköön kompressori rikki');
assert.equal(payload.orderer_name, null);
assert.equal(payload.location_text, null);
assert.equal(payload.equipment_id, null);
assert.equal(payload.status, 'draft');
assert.equal(payload.customer_id, 'cust-1');
assert.equal(payload.created_by_user_id, 'user-1');
assert.equal(payload.assigned_user_id, null);
assert.equal(buildWorkReportHeadingFromQuote(data), 'Vanha jäähdytysyksikköön kompressori rikki');
assert.equal(
  buildWorkReportDescriptionFromQuote(data),
  'Tarjotaan teille seuraavasti: Uuden ilmalämpöpumpun asennus vanhan laitteen tilalle.',
);

const emptyIntro = createEmptyQuoteRequestData('huolto');
emptyIntro.introText = '';
emptyIntro.faultDescription = 'Vuoto kylmäaineesta';
assert.equal(buildWorkReportHeadingFromQuote(emptyIntro), null);
assert.equal(buildWorkReportDescriptionFromQuote(emptyIntro), 'Vuoto kylmäaineesta');

console.log('test-quote-ordered-status: ok');
