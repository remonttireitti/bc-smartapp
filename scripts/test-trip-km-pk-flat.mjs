import assert from 'node:assert/strict';
import {
  TRIP_PK_FLAT_CUSTOMER_EUR,
  TRIP_PK_FLAT_PARTNER_EUR,
  formatTripKmExpenseDescription,
  resolveTripKmBillingLine,
  syncTripKmExpenseDrafts,
  tripKmExpenseBillingLine,
  tripKmExpenseUsesMinimumBilling,
  tripKmLineTotal,
} from '../src/lib/tripKmExpense.ts';
import { expenseLineTotal } from '../src/types/index.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('Messut PK 39.9 km → partner flat 45, customer flat 55 (ei 0.90×km)', () => {
  const partner = resolveTripKmBillingLine(39.9, 0.8, { flatEur: TRIP_PK_FLAT_PARTNER_EUR });
  const customer = resolveTripKmBillingLine(39.9, 1.0, { flatEur: TRIP_PK_FLAT_CUSTOMER_EUR });
  assert.equal(partner.usesMinimum, true);
  assert.equal(customer.usesMinimum, true);
  assert.equal(partner.qty, 1);
  assert.equal(customer.qty, 1);
  assert.equal(partner.unitPrice, 45);
  assert.equal(customer.unitPrice, 55);
  assert.equal(partner.distanceKm, 39.9);
  assert.equal(tripKmLineTotal(partner.qty, partner.unitPrice, partner.usesMinimum), 45);
  assert.equal(tripKmLineTotal(customer.qty, customer.unitPrice, customer.usesMinimum, 55), 55);
});

test('yli 50 km → €/km ilman minimi-inflaatiota (0.80 / 1.00)', () => {
  const partner = resolveTripKmBillingLine(86.4, 0.8);
  const customer = resolveTripKmBillingLine(86.4, 1.0, { flatEur: 55 });
  assert.equal(partner.usesMinimum, false);
  assert.equal(customer.usesMinimum, false);
  assert.equal(partner.qty, 86.4);
  assert.equal(partner.unitPrice, 0.8);
  assert.equal(customer.unitPrice, 1);
  assert.equal(tripKmLineTotal(partner.qty, partner.unitPrice, false), 69.12);
  assert.equal(tripKmLineTotal(customer.qty, customer.unitPrice, false), 86.4);
});

test('syncTripKmExpenseDrafts asettaa dual flat hinnat Messut-caselle', () => {
  const drafts = syncTripKmExpenseDrafts(
    [],
    [
      {
        key: 'a',
        from_label: 'Koti',
        to_label: 'Messut',
        distance_km: '39.9',
        bill_to_customer: true,
      },
    ],
    0.8,
    1.0,
    { partnerFlat: 45, customerFlat: 55 },
  );
  assert.equal(drafts.length, 1);
  const row = drafts[0];
  assert.equal(row.qty, '1');
  assert.equal(row.unit_price, '45');
  assert.equal(row.customer_unit_price, '55');
  assert.match(row.description, /39\.9 km/);
  assert.match(row.description, /PK-seutu/i);
  assert.equal(tripKmExpenseUsesMinimumBilling(row.description), true);
});

test('legacy km-rivi 39.9×0.90 nousee PK-flatiksi expenseLineTotalissa', () => {
  const partner = expenseLineTotal({
    expense_type: 'km',
    qty: 39.9,
    unit_price: 0.9,
  });
  const customer = expenseLineTotal(
    {
      expense_type: 'km',
      qty: 39.9,
      unit_price: 0.9,
      customer_unit_price: 1,
    },
    { customer: true },
  );
  assert.equal(partner, 45);
  assert.equal(customer, 55);
});

test('tallennettu 1×flat ei muutu', () => {
  const billed = tripKmExpenseBillingLine(
    { expense_type: 'km', qty: 1, unit_price: 45 },
    { flatEur: 45 },
  );
  assert.deepEqual(billed, { qty: 1, unitPrice: 45, total: 45 });
  assert.equal(
    expenseLineTotal({ expense_type: 'km', qty: 1, unit_price: 45 }),
    45,
  );
});

test('kuvaus PK-seutu', () => {
  assert.equal(
    formatTripKmExpenseDescription(39.9, true),
    'Ajomatkat (39.9 km, PK-seutu huoltoautoveloitus)',
  );
  assert.equal(formatTripKmExpenseDescription(86.4, false), 'Ajomatkat (86.4 km)');
});

console.log('All trip km PK flat tests passed.');
