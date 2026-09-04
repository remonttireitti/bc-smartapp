import assert from 'node:assert/strict';
import {
  formatTripKmCustomerPrintDescription,
  resolveTripKmCustomerPrintDescription,
  tripKmExpenseUsesMinimumBilling,
} from '../src/lib/tripKmExpense.ts';
import { resolveWorkReportLogPeriod } from '../src/types/index.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('resolveWorkReportLogPeriod uses first and last log dates', () => {
  const period = resolveWorkReportLogPeriod([
    { log_date: '2026-09-04' },
    { log_date: '2026-09-03' },
    { log_date: '2026-09-04' },
  ]);
  assert.equal(period.startDate, '2026-09-03');
  assert.equal(period.endDate, '2026-09-04');
});

test('trip km minimum customer print description', () => {
  const text = formatTripKmCustomerPrintDescription(39.9, true);
  assert.match(text, /39,9 km/);
  assert.match(text, /minimihuoltoautokorvauksen mukaan/i);
});

test('trip km normal customer print description', () => {
  const text = formatTripKmCustomerPrintDescription(86.4, false);
  assert.match(text, /86,4 km/);
  assert.match(text, /laskutetaan ajettujen km mukaan/i);
});

test('resolveTripKmCustomerPrintDescription from stored expense line', () => {
  const minimum = resolveTripKmCustomerPrintDescription({
    expense_type: 'km',
    description: 'Ajomatkat (39.9 km, minimilaskutus huoltoautosta)',
    qty: '39.9',
  });
  assert.ok(minimum);
  assert.match(minimum, /minimihuoltoautokorvauksen mukaan/i);

  const normal = resolveTripKmCustomerPrintDescription({
    expense_type: 'km',
    description: 'Ajomatkat (86.4 km)',
    qty: '86.4',
  });
  assert.ok(normal);
  assert.match(normal, /laskutetaan ajettujen km mukaan/i);
});

test('tripKmExpenseUsesMinimumBilling detects stored description', () => {
  assert.equal(
    tripKmExpenseUsesMinimumBilling('Ajomatkat (39.9 km, minimilaskutus huoltoautosta)'),
    true,
  );
  assert.equal(tripKmExpenseUsesMinimumBilling('Ajomatkat (86.4 km)'), false);
});

console.log('All work report customer print tests passed.');
