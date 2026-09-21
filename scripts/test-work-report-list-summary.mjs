import assert from 'node:assert/strict';
import {
  WORK_REPORT_LIST_SUMMARY_NO_PARTNER,
  buildWorkReportListSummary,
  compareWorkReportsForListSort,
  formatWorkReportListSummaryPartnerLine,
  parseWorkReportListSortMode,
  sortWorkReportsForList,
  workReportListCustomerLabel,
  workReportListPartnerLabel,
} from '../src/lib/workReportListSummary.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function report(partial) {
  return {
    id: partial.id ?? 'id',
    title: partial.title ?? 'Työ',
    description: null,
    orderer_name: null,
    location_text: null,
    status: partial.status ?? 'scheduled',
    scheduled_start: partial.scheduled_start ?? null,
    scheduled_end: null,
    completed_at: null,
    owner_company_id: partial.owner_company_id ?? 'own',
    created_by_company_id: partial.created_by_company_id ?? 'own',
    created_by_user_id: null,
    branding_company_id: partial.branding_company_id ?? 'own',
    partnership_id: null,
    customer_id: null,
    equipment_id: null,
    assigned_user_id: null,
    delegate_company_id: null,
    delegated_at: null,
    created_at: partial.created_at ?? '2026-09-01T10:00:00.000Z',
    customers: Object.prototype.hasOwnProperty.call(partial, 'customers') ? partial.customers : null,
    equipment: null,
    owner_company: Object.prototype.hasOwnProperty.call(partial, 'owner_company')
      ? partial.owner_company
      : { name: 'Omistaja Oy' },
    branding_company: Object.prototype.hasOwnProperty.call(partial, 'branding_company')
      ? partial.branding_company
      : null,
    assigned_user: null,
    delegate_company: null,
    created_by_user: null,
    created_by_company: Object.prototype.hasOwnProperty.call(partial, 'created_by_company')
      ? partial.created_by_company
      : { name: 'Tekijä Oy' },
  };
}

test('parseWorkReportListSortMode defaults to newest', () => {
  assert.equal(parseWorkReportListSortMode(null), 'newest');
  assert.equal(parseWorkReportListSortMode('nope'), 'newest');
  assert.equal(parseWorkReportListSortMode('partner'), 'partner');
});

test('partner label matches card meta (onBehalfOf / reporter)', () => {
  const withBranding = report({
    branding_company: { name: 'Uudenmaan Kylmähuolto Oy' },
    owner_company: { name: 'Omistaja Oy' },
  });
  assert.equal(workReportListPartnerLabel(withBranding), 'Uudenmaan Kylmähuolto Oy');

  const onlyOwner = report({ branding_company: null, owner_company: { name: 'Omistaja Oy' } });
  assert.equal(workReportListPartnerLabel(onlyOwner), 'Omistaja Oy');

  const missing = report({
    branding_company: null,
    owner_company: null,
    created_by_company: null,
  });
  assert.equal(workReportListPartnerLabel(missing), WORK_REPORT_LIST_SUMMARY_NO_PARTNER);
});

test('summary groups by status then partner with unique customers', () => {
  const rows = [
    report({
      id: '1',
      status: 'scheduled',
      branding_company: { name: 'Uudenmaan Kylmähuolto Oy' },
      customers: { name: 'ABB' },
    }),
    report({
      id: '2',
      status: 'scheduled',
      branding_company: { name: 'Uudenmaan Kylmähuolto Oy' },
      customers: { name: 'Messukeskus' },
    }),
    report({
      id: '3',
      status: 'scheduled',
      branding_company: { name: 'Toinen kumppani' },
      customers: { name: 'ABB' },
    }),
    report({
      id: '4',
      status: 'in_progress',
      branding_company: { name: 'Uudenmaan Kylmähuolto Oy' },
      customers: { name: 'ABB' },
    }),
    report({
      id: '5',
      status: 'completed',
      branding_company: { name: 'Ignoroitava' },
      customers: { name: 'X' },
    }),
  ];

  const summary = buildWorkReportListSummary(rows);
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.groups[0].statusLabel, 'Tulossa');
  assert.equal(summary.groups[0].count, 3);
  assert.equal(summary.groups[0].partners.length, 2);
  assert.equal(summary.groups[0].partners[0].partnerName, 'Toinen kumppani');
  assert.equal(summary.groups[0].partners[0].count, 1);
  assert.deepEqual(summary.groups[0].partners[1].customerNames, ['ABB', 'Messukeskus']);
  assert.equal(summary.groups[1].statusLabel, 'Työn alla');
  assert.equal(summary.groups[1].count, 1);

  const line = formatWorkReportListSummaryPartnerLine(summary.groups[0].partners[1]);
  assert.equal(line, 'Uudenmaan Kylmähuolto Oy — 2 (ABB, Messukeskus)');
});

test('summary omits empty status groups', () => {
  const summary = buildWorkReportListSummary([
    report({ id: '1', status: 'in_progress', customers: { name: 'A' } }),
  ]);
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0].status, 'in_progress');
});

test('sort newest first by created_at', () => {
  const a = report({ id: 'a', title: 'A', created_at: '2026-09-01T10:00:00.000Z' });
  const b = report({ id: 'b', title: 'B', created_at: '2026-09-10T10:00:00.000Z' });
  const sorted = sortWorkReportsForList([a, b], 'newest');
  assert.deepEqual(sorted.map((r) => r.id), ['b', 'a']);
});

test('sort alpha / partner / customer', () => {
  const a = report({
    id: 'a',
    title: 'Zebra',
    branding_company: { name: 'Beta Oy' },
    customers: { name: 'Charlie' },
  });
  const b = report({
    id: 'b',
    title: 'Alpha',
    branding_company: { name: 'Alpha Oy' },
    customers: { name: 'Bravo' },
  });
  assert.deepEqual(sortWorkReportsForList([a, b], 'alpha').map((r) => r.id), ['b', 'a']);
  assert.deepEqual(sortWorkReportsForList([a, b], 'partner').map((r) => r.id), ['b', 'a']);
  assert.deepEqual(sortWorkReportsForList([a, b], 'customer').map((r) => r.id), ['b', 'a']);
  assert.ok(compareWorkReportsForListSort(a, b, 'customer') > 0);
  assert.equal(workReportListCustomerLabel(a), 'Charlie');
});

console.log('All work-report-list-summary tests passed');
