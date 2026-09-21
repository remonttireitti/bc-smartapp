import assert from 'node:assert/strict';
import {
  filterCustomerBillingCopyLogs,
  filterPartnerBillingCopyLogs,
  formatWorkReportBillingCopy,
  formatWorkReportCustomerBillingCopy,
  formatBillingTextCopiedLabel,
  formatPrintLinkCopiedLabel,
  withBillingCopyTimestamp,
} from '../src/lib/workReportBillingCopy.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const baseLog = {
  id: 'log-1',
  work_report_id: 'wr-1',
  log_date: '2026-09-03',
  entry_type: 'regular',
  hours_regular: 3,
  hours_overtime: 0,
  hours_on_call: 0,
  created_at: '2026-09-03T08:00:00.000Z',
  expense_lines: [
    {
      id: 'exp-1',
      daily_log_id: 'log-1',
      expense_type: 'km',
      description: 'Ajomatkat (39.9 km, minimilaskutus huoltoautosta)',
      qty: 39.9,
      unit_price: 0.88,
      bill_to_customer: true,
      sort_order: 0,
    },
    {
      id: 'exp-2',
      daily_log_id: 'log-1',
      expense_type: 'part',
      description: 'Moottori',
      qty: 1,
      unit_price: 2100,
      bill_to_customer: true,
      sort_order: 1,
    },
  ],
};

test('customer billing copy includes customer, date, hours, expenses and commission', () => {
  const text = formatWorkReportCustomerBillingCopy({
    title: 'Asennus',
    customerName: 'Messukeskus',
    logs: [
      {
        ...baseLog,
        commission_note: '5 % provisio',
      },
    ],
  });
  assert.match(text, /Asiakas: Messukeskus/);
  assert.match(text, /3\.9\.2026/);
  assert.match(text, /3\.00 h/);
  assert.match(text, /KM-korvaus: Ajomatkat/);
  assert.match(text, /Varaosa: Moottori/);
  assert.match(text, /Provisio: 5 % provisio/);
});

test('customer billing copy filters to unbilled logs after customer billed timestamp', () => {
  const logs = [
    { ...baseLog, id: 'old', created_at: '2026-09-03T08:00:00.000Z' },
    {
      ...baseLog,
      id: 'new',
      log_date: '2026-09-04',
      created_at: '2026-09-04T09:00:00.000Z',
    },
  ];
  const { logs: filtered, partialUnbilledOnly } = filterCustomerBillingCopyLogs(logs, {
    billing: {
      partner_invoice_status: 'none',
      partner_invoice_amount: null,
      partner_billed_amount: null,
      partner_billed_at: null,
      customer_invoice_status: 'paid',
      customer_invoice_amount: 1000,
      customer_billed_at: '2026-09-03T12:00:00.000Z',
    },
  });
  assert.equal(partialUnbilledOnly, true);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'new');
});

test('customer billing copy partial header when only unbilled entries copied', () => {
  const text = formatWorkReportCustomerBillingCopy({
    title: 'Asennus',
    customerName: 'Messukeskus',
    logs: [baseLog],
    partialUnbilledOnly: true,
  });
  assert.match(text, /Laskuttamatta \(uudet päiväkirjaukset\):/);
});

test('partner billing copy is compact with customer, dates, hours and travel', () => {
  const text = formatWorkReportBillingCopy({
    title: 'Messukeskus – Messutoimisto jäähdytyskasetin asennus',
    partnerName: 'Lämpökatsastus Oy',
    customerName: 'Messukeskus',
    logs: [
      {
        ...baseLog,
        log_date: '2026-08-31',
        hours_regular: 8,
        expense_lines: baseLog.expense_lines.map((line) => ({
          ...line,
          bill_to_partner: true,
        })),
      },
      {
        ...baseLog,
        id: 'log-2',
        log_date: '2026-09-01',
        hours_regular: 8,
        expense_lines: [],
      },
    ],
  });
  assert.match(text, /^Messukeskus/);
  assert.match(text, /31\.8\.?-1\.9\.?/);
  assert.match(text, /16h/);
  assert.match(text, /min\.ajo/);
  assert.ok(text.length <= 100, `partner copy should be max 100 chars, got ${text.length}: ${text}`);
});

test('partner billing copy filters to unbilled logs after partner billed timestamp', () => {
  const logs = [
    { ...baseLog, id: 'old', created_at: '2026-09-03T08:00:00.000Z' },
    {
      ...baseLog,
      id: 'new',
      log_date: '2026-09-04',
      created_at: '2026-09-04T09:00:00.000Z',
    },
  ];
  const { logs: filtered, partialUnbilledOnly } = filterPartnerBillingCopyLogs(logs, {
    owner_company_id: 'owner',
    created_by_company_id: 'creator',
    delegate_company_id: 'delegate',
    billing: {
      partner_invoice_status: 'paid',
      partner_invoice_amount: 1000,
      partner_billed_amount: 500,
      partner_billed_at: '2026-09-03T12:00:00.000Z',
      customer_invoice_status: 'none',
      customer_invoice_amount: null,
      customer_billed_at: null,
    },
    billable: {
      partner_total: 1000,
      calculation: { byUser: [{ lines: [] }] },
    },
  });
  assert.equal(partialUnbilledOnly, true);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'new');
});

test('partner billing copy keeps all logs when partial only from recalculated open amount', () => {
  const logs = [{ ...baseLog, id: 'only', created_at: '2026-09-03T06:00:00.000Z' }];
  const { logs: filtered, partialUnbilledOnly } = filterPartnerBillingCopyLogs(logs, {
    owner_company_id: 'owner',
    created_by_company_id: 'creator',
    delegate_company_id: 'delegate',
    billing: {
      partner_invoice_status: 'none',
      partner_invoice_amount: 1685.11,
      partner_billed_amount: 835.11,
      partner_billed_at: '2026-09-03T07:02:00.000Z',
      customer_invoice_status: 'none',
      customer_invoice_amount: null,
      customer_billed_at: null,
    },
    billable: {
      partner_total: 1685.11,
      calculation: { byUser: [{ lines: [] }] },
    },
  });
  assert.equal(partialUnbilledOnly, false);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'only');
});


test('billing text copied label uses Finnish format and returns null when unset', () => {
  assert.equal(formatBillingTextCopiedLabel(null), null);
  assert.equal(formatBillingTextCopiedLabel(undefined), null);
  const label = formatBillingTextCopiedLabel('2026-09-21T13:00:00.000Z');
  assert.match(label, /^Laskutusteksti kopioitu - /);
  assert.match(label, /21\.9\.2026/);
  assert.match(label, /klo/);
});

test('print link copied label uses Finnish format and returns null when unset', () => {
  assert.equal(formatPrintLinkCopiedLabel(null), null);
  const label = formatPrintLinkCopiedLabel('2026-09-21T13:00:00.000Z');
  assert.match(label, /^Tulostelinkki kopioitu - /);
  assert.match(label, /21\.9\.2026/);
});

test('withBillingCopyTimestamp updates only the matching field and not invoice status', () => {
  const row = {
    id: 'wr-1',
    title: 'Test',
    status: 'completed',
    completed_at: null,
    scheduled_start: null,
    created_at: '2026-09-01T00:00:00.000Z',
    owner_company_id: 'o',
    created_by_company_id: 'o',
    delegate_company_id: null,
    customers: null,
    owner_company: null,
    delegate_company: null,
    billing: {
      partner_invoice_status: 'none',
      partner_invoice_amount: 100,
      partner_billed_amount: null,
      partner_billed_at: null,
      customer_invoice_status: 'none',
      customer_invoice_amount: null,
      customer_billed_at: null,
    },
    billable: null,
  };
  const afterText = withBillingCopyTimestamp(row, 'billing_text', '2026-09-21T13:00:00.000Z');
  assert.equal(afterText.billing.billing_text_copied_at, '2026-09-21T13:00:00.000Z');
  assert.equal(afterText.billing.print_link_copied_at, undefined);
  assert.equal(afterText.billing.partner_invoice_status, 'none');
  assert.equal(afterText.billing.customer_invoice_status, 'none');

  const afterLink = withBillingCopyTimestamp(afterText, 'print_link', '2026-09-21T14:00:00.000Z');
  assert.equal(afterLink.billing.billing_text_copied_at, '2026-09-21T13:00:00.000Z');
  assert.equal(afterLink.billing.print_link_copied_at, '2026-09-21T14:00:00.000Z');
  assert.equal(afterLink.billing.partner_invoice_status, 'none');

  const reCopy = withBillingCopyTimestamp(afterLink, 'billing_text', '2026-09-21T15:00:00.000Z');
  assert.equal(reCopy.billing.billing_text_copied_at, '2026-09-21T15:00:00.000Z');
});

console.log('All customer billing copy tests passed.');
