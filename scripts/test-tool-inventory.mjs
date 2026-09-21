import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  canStartToolLoan,
  computeDeliveryFee,
  dateYmdOverlapsBusy,
  formatLoanRangeFi,
  formatToolEuro,
  groupLoansByMonth,
  hasOverlappingToolLoan,
  loanRangesOverlap,
  parseOptionalEuro,
  shiftMonth,
  hasToolPurchaseInfo,
  toolDayRateBadge,
  toolFilledRateRows,
  toolRateLabelRows,
} from '../src/lib/toolInventory.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('formatToolEuro and rate labels', () => {
  assert.equal(formatToolEuro(null), '—');
  assert.equal(formatToolEuro(12.5), '12,5 €');
  const rows = toolRateLabelRows({
    rate_day_eur: 10,
    rate_weekend_eur: null,
    rate_week_eur: 40,
    rate_month_eur: 120,
  });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].label, '€/päivä');
  assert.equal(rows[0].value, '10 €');
  assert.equal(toolDayRateBadge({ rate_day_eur: 15 }), '15 €/pv');
  assert.equal(toolDayRateBadge({ rate_day_eur: null }), null);
});


test('filled rates and purchase info hide empty dashes', () => {
  const filled = toolFilledRateRows({
    rate_day_eur: 10,
    rate_weekend_eur: null,
    rate_week_eur: null,
    rate_month_eur: 120,
  });
  assert.equal(filled.length, 2);
  assert.equal(filled[0].key, 'day');
  assert.equal(filled[1].key, 'month');
  assert.equal(toolFilledRateRows({}).length, 0);
  assert.equal(hasToolPurchaseInfo({}), false);
  assert.equal(hasToolPurchaseInfo({ purchased_from: '  ' }), false);
  assert.equal(hasToolPurchaseInfo({ purchased_at: '2026-01-01' }), true);
  assert.equal(hasToolPurchaseInfo({ purchase_price_eur: 12 }), true);
});
test('loanable gate', () => {
  assert.equal(canStartToolLoan({ is_loanable: false, hasOpenLoan: false }).ok, false);
  assert.equal(canStartToolLoan({ is_loanable: true, status: 'loaned', hasOpenLoan: false }).ok, false);
  assert.equal(canStartToolLoan({ is_loanable: true, status: 'available', hasOpenLoan: true }).ok, false);
  assert.equal(canStartToolLoan({ is_loanable: true, status: 'service', hasOpenLoan: false }).ok, false);
  assert.equal(canStartToolLoan({ is_loanable: true, status: 'available', hasOpenLoan: false }).ok, true);
});

test('calendar overlap open-ended and closed', () => {
  assert.equal(
    loanRangesOverlap('2026-09-01T00:00:00Z', '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z', '2026-09-10T00:00:00Z'),
    true,
  );
  assert.equal(
    loanRangesOverlap('2026-09-01T00:00:00Z', '2026-09-04T00:00:00Z', '2026-09-05T00:00:00Z', '2026-09-10T00:00:00Z'),
    false,
  );
  assert.equal(
    loanRangesOverlap('2026-09-01T00:00:00Z', null, '2026-09-20T00:00:00Z', '2026-09-22T00:00:00Z'),
    true,
  );
});

test('hasOverlappingToolLoan respects returned and expected_return_at', () => {
  const loans = [
    {
      loaned_at: '2026-09-01T10:00:00.000Z',
      returned_at: '2026-09-03T10:00:00.000Z',
      expected_return_at: '2026-09-05T10:00:00.000Z',
    },
    {
      loaned_at: '2026-09-10T10:00:00.000Z',
      returned_at: null,
      expected_return_at: '2026-09-15T10:00:00.000Z',
    },
  ];
  assert.equal(hasOverlappingToolLoan(loans, '2026-09-02T00:00:00.000Z', '2026-09-02T12:00:00.000Z'), false);
  assert.equal(hasOverlappingToolLoan(loans, '2026-09-12T00:00:00.000Z', '2026-09-13T00:00:00.000Z'), true);
  assert.equal(hasOverlappingToolLoan(loans, '2026-09-16T00:00:00.000Z', '2026-09-17T00:00:00.000Z'), false);
});

test('groupLoansByMonth and formatLoanRangeFi', () => {
  const groups = groupLoansByMonth([
    { loaned_at: '2026-09-05T12:00:00.000Z', expected_return_at: '2026-09-08T12:00:00.000Z' },
    { loaned_at: '2026-08-20T12:00:00.000Z', returned_at: null, expected_return_at: null },
  ]);
  assert.ok(groups.length >= 1);
  assert.match(formatLoanRangeFi('2026-09-05T12:00:00.000Z', null), /avoin/);
  assert.equal(parseOptionalEuro('12,5'), 12.5);
  assert.equal(parseOptionalEuro(''), null);
});

test('computeDeliveryFee short vs over limit', () => {
  assert.equal(
    computeDeliveryFee({ distanceKm: 5, minFeeEur: 25, limitKm: 10, perKmEur: 2 }),
    25,
  );
  assert.equal(
    computeDeliveryFee({ distanceKm: 10, minFeeEur: 25, limitKm: 10, perKmEur: 2 }),
    25,
  );
  assert.equal(
    computeDeliveryFee({ distanceKm: 15, minFeeEur: 25, limitKm: 10, perKmEur: 2 }),
    35,
  );
  assert.equal(
    computeDeliveryFee({ distanceKm: 0, minFeeEur: 20, limitKm: 0, perKmEur: 3 }),
    20,
  );
  assert.equal(
    computeDeliveryFee({ distanceKm: 4, minFeeEur: 20, limitKm: 0, perKmEur: 3 }),
    32,
  );
  assert.ok(Number.isNaN(computeDeliveryFee({ distanceKm: NaN, minFeeEur: 1, limitKm: 1, perKmEur: 1 })));
});

test('dateYmdOverlapsBusy and month grid', () => {
  const ranges = [
    { tool_id: 'a', starts_at: '2026-09-10T00:00:00.000Z', ends_at: '2026-09-12T23:59:59.000Z' },
  ];
  assert.equal(dateYmdOverlapsBusy('2026-09-11', ranges, 'a'), true);
  assert.equal(dateYmdOverlapsBusy('2026-09-13', ranges, 'a'), false);
  assert.equal(dateYmdOverlapsBusy('2026-09-11', ranges, 'b'), false);
  const grid = buildMonthGrid(2026, 8);
  assert.equal(grid.length, 42);
  assert.ok(grid.some((c) => c.ymd === '2026-09-01' && c.inMonth));
  const next = shiftMonth(2026, 8, 1);
  assert.equal(next.year, 2026);
  assert.equal(next.monthIndex0, 9);
});

console.log('All tool inventory + delivery fee tests passed.');
