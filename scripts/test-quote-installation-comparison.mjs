import assert from 'node:assert/strict';
import {
  compareQuoteInstallationToWorkReport,
  computeQuoteInstallationBudget,
  computeWorkReportInstallationActual,
  quoteLaborHours,
  quoteTravelKm,
} from '../src/lib/quoteInstallationComparison.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';

const partnerRates = {
  hourly_regular: 50,
  hourly_overtime: 75,
  hourly_on_call: 100,
};

const quoteData = {
  type: 'huolto',
  workItems: [
    {
      id: '1',
      description: 'Ajo',
      hours: 10,
      pricePerHour: 65,
      materials: [],
    },
    {
      id: '2',
      description: 'Jäähdytyksen asennus muuntamoon 3 x',
      hours: 48,
      pricePerHour: 65,
      materials: [],
    },
    {
      id: '3',
      description: 'Matkat',
      hours: 0,
      pricePerHour: 0,
      materials: [
        {
          id: 'km-1',
          name: 'Km-korvaus',
          quantity: 750,
          purchasePrice: 1,
          marginPercent: 25,
          sellPrice: 1.25,
        },
      ],
    },
  ],
  laborHours: 0,
  installationLaborPurchaseRate: 50,
  travelKmEnabled: false,
  travelKmDistance: 0,
  travelKmRate: 1,
};

assert.equal(quoteLaborHours(quoteData), 58);
assert.equal(quoteTravelKm(quoteData), 750);

const quoteBudget = computeQuoteInstallationBudget(quoteData, {
  partnerRates,
  tripKmRate: 0.65,
});
assert.equal(quoteBudget.quoteTotalNet, 2900 + 487.5);

const logs = [
  {
    id: 'log-1',
    work_report_id: 'wr-1',
    log_date: '2024-09-08',
    entry_type: 'regular',
    hours_regular: 5,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [{ distance_km: 405.3 }],
    expenses: [],
    created_by: 'user-1',
    created_at: '2024-09-08T10:00:00Z',
  },
  {
    id: 'log-2',
    work_report_id: 'wr-1',
    log_date: '2024-09-09',
    entry_type: 'regular',
    hours_regular: 12,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [],
    expenses: [],
    created_by: 'user-1',
    created_at: '2024-09-09T10:00:00Z',
  },
  {
    id: 'log-3',
    work_report_id: 'wr-1',
    log_date: '2024-09-10',
    entry_type: 'regular',
    hours_regular: 11,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [],
    expenses: [],
    created_by: 'user-1',
    created_at: '2024-09-10T10:00:00Z',
  },
  {
    id: 'log-4',
    work_report_id: 'wr-1',
    log_date: '2024-09-11',
    entry_type: 'regular',
    hours_regular: 10,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [],
    expenses: [],
    created_by: 'user-1',
    created_at: '2024-09-11T10:00:00Z',
  },
  {
    id: 'log-5',
    work_report_id: 'wr-1',
    log_date: '2024-09-12',
    entry_type: 'regular',
    hours_regular: 15,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [{ distance_km: 657.8 }],
    expenses: [],
    created_by: 'user-1',
    created_at: '2024-09-12T10:00:00Z',
  },
];

const users = [
  {
    id: 'user-1',
    display_name: 'Eero',
    bill_hours_enabled: true,
    bill_expenses_enabled: true,
  },
];

const partnerCalculation = calculateWorkReportBillable({
  logs,
  users,
  rates: partnerRates,
  ratesSource: 'company_default',
  tripKmRate: 0.65,
});

assert.equal(partnerCalculation.grandTotal, 3341.02);

const actual = computeWorkReportInstallationActual(partnerCalculation, logs);
assert.equal(actual.rows.find((row) => row.key === 'hours')?.actualQty, 53);
assert.equal(actual.rows.find((row) => row.key === 'travel_km')?.actualQty, 1063.1);
assert.equal(actual.actualTotalNet, 3341.02);

const comparison = compareQuoteInstallationToWorkReport({
  quoteData,
  partnerCalculation,
  logs,
  partnerRates,
  tripKmRate: 0.65,
});

assert.ok(comparison);
assert.equal(comparison.quoteTotalNet, 3387.5);
assert.equal(comparison.actualTotalNet, 3341.02);
assert.equal(comparison.varianceNet, -46.48);

const hoursRow = comparison.rows.find((row) => row.key === 'hours');
assert.equal(hoursRow?.quoteQty, 58);
assert.equal(hoursRow?.actualQty, 53);

const travelKmRow = comparison.rows.find((row) => row.key === 'travel_km');
assert.equal(travelKmRow?.quoteQty, 750);
assert.equal(travelKmRow?.actualQty, 1063.1);

const laborRow = comparison.rows.find((row) => row.key === 'labor');
assert.equal(laborRow?.quoteCostNet, 2900);
assert.equal(laborRow?.actualCostNet, 2650);
assert.equal(laborRow?.varianceNet, -250);

const travelRow = comparison.rows.find((row) => row.key === 'travel');
assert.equal(travelRow?.quoteCostNet, 487.5);
assert.equal(travelRow?.actualCostNet, 691.02);
assert.equal(travelRow?.varianceNet, 203.52);

console.log('quote-installation-comparison: ok');
