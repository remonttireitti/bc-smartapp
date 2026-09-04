import assert from 'node:assert/strict';
import {
  filterCustomerBillingCopyLogs,
  formatWorkReportCustomerBillingCopy,
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

console.log('All customer billing copy tests passed.');
