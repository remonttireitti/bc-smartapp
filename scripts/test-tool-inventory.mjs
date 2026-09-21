import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  canStartToolBlockout,
  canStartToolLoan,
  computeDeliveryFee,
  computeBookingDeliveryFee,
  deliveryModeCompanyLegCount,
  deliveryModeHasOutbound,
  deliveryModeHasReturn,
  deliveryModeFromToggles,
  deliveryModeNeedsAddress,
  dateYmdAllSelectedFree,
  dateYmdBookingDayStatus,
  dateYmdOverlapsBusy,
  isHardBusyRange,
  isQueuedBusyRange,
  evaluateMultiToolAvailability,
  formatLoanRangeFi,
  formatToolEuro,
  formatYmdRangeFi,
  groupLoansByMonth,
  hasOverlappingToolLoan,
  isRealOpenLoan,
  isToolBlockout,
  loanRangesOverlap,
  parseOptionalEuro,
  rangeOverlapsBusyForTool,
  shiftMonth,
  shouldTreatAsOwnerBlockout,
  hasToolPurchaseInfo,
  toolDayRateBadge,
  toolFilledRateRows,
  toolRateLabelRows,
  toolShowsAsLoaned,
  toolStatusBadgeLabel,
  ymdAddDays,
  ymdInclusiveLengthDays,
  estimateToolRentalEur,
  estimateBookingCost,
  isWeekendRatePackage,
  selectionOverlapsPending,
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

test('deliveryMode legs and booking fee (self / one / both)', () => {
  assert.equal(deliveryModeCompanyLegCount('none'), 0);
  assert.equal(deliveryModeCompanyLegCount('delivery'), 1);
  assert.equal(deliveryModeCompanyLegCount('pickup'), 1);
  assert.equal(deliveryModeCompanyLegCount('both'), 2);
  assert.equal(deliveryModeHasOutbound('delivery'), true);
  assert.equal(deliveryModeHasOutbound('pickup'), false);
  assert.equal(deliveryModeHasReturn('pickup'), true);
  assert.equal(deliveryModeHasReturn('delivery'), false);
  assert.equal(deliveryModeHasOutbound('both'), true);
  assert.equal(deliveryModeHasReturn('both'), true);
  assert.equal(deliveryModeNeedsAddress('none'), false);
  assert.equal(deliveryModeNeedsAddress('pickup'), true);
  assert.equal(deliveryModeNeedsAddress('both'), true);

  const feeInput = { distanceKm: 15, minFeeEur: 25, limitKm: 10, perKmEur: 2 }; // per leg = 35
  assert.equal(computeBookingDeliveryFee('none', feeInput), null);
  assert.equal(computeBookingDeliveryFee('delivery', feeInput), 35);
  assert.equal(computeBookingDeliveryFee('pickup', feeInput), 35);
  assert.equal(computeBookingDeliveryFee('both', feeInput), 70);
  assert.equal(
    computeBookingDeliveryFee('both', { distanceKm: 5, minFeeEur: 25, limitKm: 10, perKmEur: 2 }),
    50,
  );
  assert.ok(Number.isNaN(computeBookingDeliveryFee('delivery', { distanceKm: NaN, minFeeEur: 1, limitKm: 1, perKmEur: 1 })));

  assert.equal(deliveryModeFromToggles(false, false), 'none');
  assert.equal(deliveryModeFromToggles(true, false), 'delivery');
  assert.equal(deliveryModeFromToggles(false, true), 'pickup');
  assert.equal(deliveryModeFromToggles(true, true), 'both');
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


test('blockout vs loan helpers and badges', () => {
  assert.equal(isToolBlockout({ is_blockout: true }), true);
  assert.equal(isToolBlockout({ is_blockout: false }), false);
  assert.equal(isRealOpenLoan({ returned_at: null, is_blockout: false }), true);
  assert.equal(isRealOpenLoan({ returned_at: null, is_blockout: true }), false);
  assert.equal(isRealOpenLoan({ returned_at: '2026-09-01T00:00:00Z', is_blockout: false }), false);

  // Never Lainassa when not loanable — even if status/open loan look loaned
  assert.equal(
    toolShowsAsLoaned({ is_loanable: false, status: 'loaned', hasOpenRealLoan: true }),
    false,
  );
  assert.equal(
    toolShowsAsLoaned({ is_loanable: true, status: 'available', hasOpenRealLoan: true }),
    true,
  );
  assert.equal(
    toolStatusBadgeLabel({
      is_loanable: false,
      status: 'loaned',
      hasOpenRealLoan: false,
      hasOpenBlockout: true,
    }),
    'Suljettu',
  );
  assert.equal(
    toolStatusBadgeLabel({
      is_loanable: false,
      status: 'loaned',
      hasOpenRealLoan: true,
      hasOpenBlockout: false,
    }),
    'Vapaa',
  );
  assert.equal(
    toolStatusBadgeLabel({
      is_loanable: true,
      status: 'loaned',
      hasOpenRealLoan: true,
      hasOpenBlockout: false,
    }),
    'Lainassa',
  );
});

test('owner self-assignment is blockout; blockout gate vs loan gate', () => {
  assert.equal(
    shouldTreatAsOwnerBlockout({ borrowerUserId: 'u1', sessionUserId: 'u1' }),
    true,
  );
  assert.equal(
    shouldTreatAsOwnerBlockout({ borrowerUserId: 'u2', sessionUserId: 'u1' }),
    false,
  );
  assert.equal(
    shouldTreatAsOwnerBlockout({
      borrowerUserId: 'u2',
      sessionUserId: 'u1',
      explicitBlockout: true,
    }),
    true,
  );

  // Blockout allowed when not loanable
  assert.equal(
    canStartToolBlockout({ status: 'available', hasOpenBlockingPeriod: false }).ok,
    true,
  );
  assert.equal(
    canStartToolLoan({ is_loanable: false, status: 'available', hasOpenLoan: false }).ok,
    false,
  );
  assert.equal(
    canStartToolBlockout({ status: 'available', hasOpenBlockingPeriod: true }).ok,
    false,
  );
  assert.equal(
    canStartToolBlockout({ status: 'retired', hasOpenBlockingPeriod: false }).ok,
    false,
  );
});

test('groupLoansByMonth carries is_blockout', () => {
  const groups = groupLoansByMonth([
    {
      loaned_at: '2026-09-15T12:00:00.000Z',
      returned_at: null,
      expected_return_at: null,
      is_blockout: true,
    },
    {
      loaned_at: '2026-09-03T12:00:00.000Z',
      returned_at: '2026-09-03T18:00:00.000Z',
      expected_return_at: '2026-09-03T18:00:00.000Z',
      is_blockout: false,
    },
  ]);
  const sept = groups.find((g) => g.monthKey === '2026-09');
  assert.ok(sept);
  assert.equal(sept.ranges.some((r) => r.is_blockout), true);
  assert.equal(sept.ranges.some((r) => !r.is_blockout), true);
});

test('ymd helpers and range overlap for tool', () => {
  assert.equal(ymdAddDays('2026-09-21', 3), '2026-09-24');
  assert.equal(ymdAddDays('2026-09-30', 1), '2026-10-01');
  assert.equal(ymdInclusiveLengthDays('2026-09-21', '2026-09-23'), 3);
  assert.equal(ymdInclusiveLengthDays('2026-09-21', '2026-09-21'), 1);
  assert.match(formatYmdRangeFi('2026-09-21', '2026-09-23'), /21/);

  const ranges = [
    { tool_id: 'a', starts_at: '2026-09-10T00:00:00.000Z', ends_at: '2026-09-12T23:59:59.000Z', source: 'loan' },
    { tool_id: 'b', starts_at: '2026-09-15T00:00:00.000Z', ends_at: '2026-09-16T23:59:59.000Z', source: 'blockout' },
    { tool_id: 'c', starts_at: '2026-09-20T00:00:00.000Z', ends_at: null, source: 'booking' },
  ];
  assert.equal(rangeOverlapsBusyForTool('2026-09-11', '2026-09-11', ranges, 'a'), true);
  assert.equal(rangeOverlapsBusyForTool('2026-09-13', '2026-09-14', ranges, 'a'), false);
  assert.equal(rangeOverlapsBusyForTool('2026-09-15', '2026-09-15', ranges, 'b'), true);
  assert.equal(rangeOverlapsBusyForTool('2026-09-25', '2026-09-26', ranges, 'c'), true);
  assert.equal(dateYmdAllSelectedFree('2026-09-11', ranges, ['a', 'b']), false);
  assert.equal(dateYmdAllSelectedFree('2026-09-14', ranges, ['a', 'b']), true);
});

test('multi-tool availability suggestions (skip busy + next window)', () => {
  const tools = [
    { id: 'drill', name: 'Porakone' },
    { id: 'saw', name: 'Saha' },
    { id: 'laser', name: 'Laser' },
  ];
  const busy = [
    { tool_id: 'saw', starts_at: '2026-09-22T00:00:00.000Z', ends_at: '2026-09-24T23:59:59.000Z', source: 'booking' },
    { tool_id: 'laser', starts_at: '2026-09-28T00:00:00.000Z', ends_at: '2026-09-30T23:59:59.000Z', source: 'loan' },
  ];

  const partial = evaluateMultiToolAvailability({
    tools,
    selectedIds: ['drill', 'saw', 'laser'],
    startYmd: '2026-09-22',
    endYmd: '2026-09-24',
    busy,
  });
  assert.deepEqual(partial.freeTools.map((t) => t.id).sort(), ['drill', 'laser']);
  assert.deepEqual(partial.busyTools.map((t) => t.id), ['saw']);
  assert.match(partial.messagesFi.skipBusy, /Saha/);
  assert.match(partial.messagesFi.skipBusy, /vuokraa muut valitut ilman sitä/);
  assert.ok(partial.nextAllFreeWindow);
  assert.equal(partial.nextAllFreeWindow.startYmd, '2026-09-25');
  assert.equal(partial.nextAllFreeWindow.endYmd, '2026-09-27');
  assert.match(partial.messagesFi.nextWindow, /kaikki valitut ovat vapaita/);

  const allFree = evaluateMultiToolAvailability({
    tools,
    selectedIds: ['drill', 'saw'],
    startYmd: '2026-09-25',
    endYmd: '2026-09-26',
    busy,
  });
  assert.equal(allFree.busyTools.length, 0);
  assert.equal(allFree.nextAllFreeWindow, null);
  assert.equal(allFree.messagesFi.skipBusy, null);
});


test('booking day status: free / queued / busy and selection filter', () => {
  const ranges = [
    { tool_id: 'a', starts_at: '2026-09-10T00:00:00.000Z', ends_at: '2026-09-12T23:59:59.000Z', source: 'booking', status: 'pending' },
    { tool_id: 'b', starts_at: '2026-09-10T00:00:00.000Z', ends_at: '2026-09-12T23:59:59.000Z', source: 'booking', status: 'confirmed' },
    { tool_id: 'c', starts_at: '2026-09-20T00:00:00.000Z', ends_at: '2026-09-21T23:59:59.000Z', source: 'loan', status: 'active' },
  ];
  assert.equal(isQueuedBusyRange(ranges[0]), true);
  assert.equal(isHardBusyRange(ranges[0]), false);
  assert.equal(isHardBusyRange(ranges[1]), true);
  assert.equal(dateYmdBookingDayStatus('2026-09-11', ranges, ['a']), 'queued');
  assert.equal(dateYmdBookingDayStatus('2026-09-11', ranges, ['b']), 'busy');
  assert.equal(dateYmdBookingDayStatus('2026-09-11', ranges, ['a', 'b']), 'busy');
  assert.equal(dateYmdBookingDayStatus('2026-09-15', ranges, ['a']), 'free');
  assert.equal(dateYmdBookingDayStatus('2026-09-20', ranges, ['c']), 'busy');
  // empty selection = all tools (union)
  assert.equal(dateYmdBookingDayStatus('2026-09-11', ranges, []), 'busy');
});

console.log('All tool inventory + delivery fee tests passed.');

test('weekend package and rental estimate', () => {
  assert.equal(isWeekendRatePackage('2026-09-25', '2026-09-27'), true); // Fri–Sun
  assert.equal(isWeekendRatePackage('2026-09-26', '2026-09-27'), true); // Sat–Sun
  assert.equal(isWeekendRatePackage('2026-09-21', '2026-09-23'), false); // Mon–Wed
  assert.equal(
    estimateToolRentalEur({ rate_day_eur: 10, rate_weekend_eur: 25 }, '2026-09-25', '2026-09-27'),
    25,
  );
  assert.equal(estimateToolRentalEur({ rate_day_eur: 10 }, '2026-09-21', '2026-09-23'), 30);
  assert.equal(
    estimateToolRentalEur({ rate_day_eur: 10, rate_week_eur: 50 }, '2026-09-01', '2026-09-10'),
    80,
  ); // 7+3 → 50+30
  assert.equal(
    estimateToolRentalEur({ rate_month_eur: 200, rate_day_eur: 10 }, '2026-09-01', '2026-09-30'),
    220,
  ); // 28+2
  assert.equal(estimateToolRentalEur({}, '2026-09-01', '2026-09-03'), null);
});

test('estimateBookingCost sums rental and delivery', () => {
  const tools = [
    { id: 'a', rate_day_eur: 10 },
    { id: 'b', rate_day_eur: 20 },
  ];
  const est = estimateBookingCost({
    tools,
    selectedIds: ['a', 'b'],
    startYmd: '2026-09-21',
    endYmd: '2026-09-22',
    deliveryFeeEur: 35,
  });
  assert.equal(est.dayCount, 2);
  assert.equal(est.toolCount, 2);
  assert.equal(est.rentalEur, 60);
  assert.equal(est.deliveryEur, 35);
  assert.equal(est.totalEur, 95);
  const noDel = estimateBookingCost({
    tools,
    selectedIds: ['a'],
    startYmd: '2026-09-21',
    endYmd: '2026-09-21',
    deliveryFeeEur: null,
  });
  assert.equal(noDel.rentalEur, 10);
  assert.equal(noDel.deliveryEur, null);
  assert.equal(noDel.totalEur, 10);
});

test('selectionOverlapsPending detects soft queue overlap', () => {
  const busy = [
    {
      tool_id: 't1',
      starts_at: '2026-09-21T00:00:00.000Z',
      ends_at: '2026-09-23T23:59:59.000Z',
      source: 'booking',
      status: 'pending',
    },
  ];
  assert.equal(selectionOverlapsPending('2026-09-21', '2026-09-22', busy, ['t1']), true);
  assert.equal(selectionOverlapsPending('2026-09-24', '2026-09-25', busy, ['t1']), false);
  assert.equal(selectionOverlapsPending('2026-09-21', '2026-09-22', busy, ['other']), false);
  const hard = [
    {
      tool_id: 't1',
      starts_at: '2026-09-21T00:00:00.000Z',
      ends_at: '2026-09-23T23:59:59.000Z',
      source: 'loan',
      status: 'active',
    },
  ];
  // hard busy: helper skips (availability already blocks); no pending → false
  assert.equal(selectionOverlapsPending('2026-09-21', '2026-09-22', hard, ['t1']), false);
});
