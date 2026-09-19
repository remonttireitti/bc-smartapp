import assert from 'node:assert/strict';
import {
  aggregateQuoteRequestStats,
  filterQuoteRowsForStats,
  isQuoteStatsPeriod,
  quoteRowGrossTotal,
} from '../src/lib/quoteRequest/quoteRequestStats.ts';
import { canDeleteQuoteRequest } from '../src/lib/deletePermissions.ts';
import { QUOTE_DELETE_DENIED_MESSAGE } from '../src/lib/deleteQuoteRequest.ts';
import { QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE } from '../src/lib/revertQuoteRequestToDraft.ts';

const anchor = new Date('2026-06-15T12:00:00');

assert.equal(isQuoteStatsPeriod(new Date('2026-06-10'), 'this_month', anchor), true);
assert.equal(isQuoteStatsPeriod(new Date('2026-05-31'), 'this_month', anchor), false);
assert.equal(isQuoteStatsPeriod(new Date('2026-06-16'), 'this_week', anchor), true);
assert.equal(isQuoteStatsPeriod(new Date('2026-06-09'), 'this_week', anchor), false);
assert.equal(isQuoteStatsPeriod(new Date('2026-01-02'), 'this_year', anchor), true);
assert.equal(isQuoteStatsPeriod(new Date('2025-12-31'), 'this_year', anchor), false);

const baseRow = {
  id: '1',
  title: 'Testi',
  status: 'sent',
  data: {
    type: 'huolto',
    quoteVatProfile: 'business',
    vatRate: 0,
    region: 'keski',
    projectType: 'korjaus',
    brandMode: 'own',
    consumptionUnit: 'kwh',
    workItems: [],
    materials: [],
    installationSupplies: [],
    lines: [],
    optionalItems: [],
    overallDiscountPercent: 0,
    laborHours: 0,
    laborRate: 0,
    travelDistanceKm: 0,
    travelRatePerKm: 0,
    travelFlatFee: 0,
    notes: '',
    introText: '',
    validUntil: '',
    deviceBrand: '',
    deviceModel: '',
    faultDescription: '',
    kotitalousEnabled: false,
    kotitalousWorkType: '',
    kotitalousDeductionPercent: 0,
    acceptedSiteDefaults: [],
  },
  owner_company_id: 'owner-1',
  created_by_company_id: 'creator-1',
  branding_company_id: 'brand-1',
  partnership_id: null,
  customer_id: null,
  equipment_id: null,
  created_at: '2026-06-10T10:00:00Z',
  updated_at: '2026-06-10T10:00:00Z',
  owner_company: { name: 'Omistaja Oy' },
  branding_company: { name: 'Brändi Oy' },
  created_by_company: { name: 'Laatija Oy' },
};

const orderedRow = {
  ...baseRow,
  id: '2',
  status: 'ordered',
  owner_company_id: 'owner-2',
  owner_company: { name: 'Kumppani Oy' },
  updated_at: '2026-06-12T10:00:00Z',
  data: {
    ...baseRow.data,
    workItems: [
      {
        id: 'w1',
        description: 'Työ',
        hours: 2,
        pricePerHour: 50,
        materials: [],
      },
    ],
  },
};

assert.equal(quoteRowGrossTotal(orderedRow), 100);

const summary = aggregateQuoteRequestStats([baseRow, orderedRow], 'this_month', anchor);
assert.equal(summary.sentCount, 1); // avoinna (lähetetty)
assert.equal(summary.orderedCount, 1);
assert.equal(summary.sentTotal, 0);
assert.equal(summary.orderedTotal, 100);
assert.equal(summary.totalCount, 2); // tarjottu = avoinna + tilattu
assert.equal(summary.totalAmount, 100);
assert.equal(summary.byCompany.length, 2);
// Tilausaste = tilattu / tarjottu (1/2), ei tilattu / vain avoimet
assert.equal(summary.conversionRate, 50);

// Pelkät tilatut → tilausaste 100 %
const onlyOrdered = aggregateQuoteRequestStats([orderedRow], 'this_month', anchor);
assert.equal(onlyOrdered.sentCount, 0);
assert.equal(onlyOrdered.orderedCount, 1);
assert.equal(onlyOrdered.totalCount, 1);
assert.equal(onlyOrdered.conversionRate, 100);

// Pelkät avoimet → tilausaste 0 %
const onlySent = aggregateQuoteRequestStats([baseRow], 'this_month', anchor);
assert.equal(onlySent.sentCount, 1);
assert.equal(onlySent.orderedCount, 0);
assert.equal(onlySent.totalCount, 1);
assert.equal(onlySent.conversionRate, 0);

const filtered = filterQuoteRowsForStats([baseRow, orderedRow], {
  disabledOwnerCompanyIds: new Set(['owner-1']),
});
assert.equal(filtered.length, 1);
assert.equal(filtered[0].id, '2');

assert.equal(
  canDeleteQuoteRequest(
    { status: 'draft', owner_company_id: 'c1', created_by_company_id: 'c1' },
    'c1',
    'admin',
  ),
  true,
);
assert.equal(
  canDeleteQuoteRequest(
    { status: 'sent', owner_company_id: 'c1', created_by_company_id: 'c1' },
    'c1',
    'admin',
  ),
  true,
);
assert.equal(
  canDeleteQuoteRequest(
    { status: 'ordered', owner_company_id: 'c1', created_by_company_id: 'c1' },
    'c1',
    'admin',
  ),
  false,
);

assert.equal(QUOTE_DELETE_DENIED_MESSAGE.includes('poisto'), true);
assert.equal(QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE.includes('luonnokseksi'), true);

console.log('test-quote-request-stats: ok');
