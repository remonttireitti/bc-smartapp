import assert from 'node:assert/strict';
import {
  canStartToolLoan,
  formatLoanRangeFi,
  formatToolEuro,
  groupLoansByMonth,
  hasOverlappingToolLoan,
  loanRangesOverlap,
  parseOptionalEuro,
  toolDayRateBadge,
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

console.log('All tool inventory helper tests passed.');
