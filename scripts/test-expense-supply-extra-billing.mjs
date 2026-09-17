import assert from 'node:assert/strict';
import {
  buildSupplyLineFlagsFromExpenseDrafts,
  computeSupplyCustomerUnitPrice,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  expenseExtraBillable,
  expenseApprovedExtraBillingCustomerPrintLabel,
  expenseExtraBillingAllowed,
  expenseSupplyExtraBillingLabel,
  expenseSupplyExtraBillingMarginImpact,
  formatExpenseSupplyExtraBillingMarginNote,
  resolveExpenseBillingMode,
  resolveExpenseExtraBillableFromSources,
  resolveExpenseExtraBillingAllowedFromSources,
  resolveSupplyLineFlagForExpenseLine,
  syncSupplyExpenseCustomerPrice,
} from '../src/lib/workReportExpenseBilling.ts';
import {
  buildCustomerExtraBillingFromLogForm,
  dailyLogCustomerExtraBillingHasData,
  dailyLogExtraBillingToForm,
  parseDailyLogCustomerExtraBilling,
  serializeDailyLogCustomerExtraBilling,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import {
  extraCustomerWorkFromDailyLogs,
  computeQuoteExtrasMarginFromLogs,
  collectExtraBillingMarginImpactLines,
  extraBillingMarginImpactStatusLabel,
  computeProjectedNetMarginIfLineApproved,
  extraBillingMarginApprovalDelta,
  formatExtraBillingMarginImpactCell,
  formatExtraBillingMarginImpactNote,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { analyzeMarginEatingExpenses } from '../src/lib/workReportQuoteMargin.ts';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { calculateWorkReportBillable, mergePartnerExtraBillingFromDailyLogs } from '../src/lib/workReportBilling.ts';

assert.equal(DEFAULT_SUPPLY_MARGIN_PERCENT, 80);
assert.equal(computeSupplyCustomerUnitPrice(100, 80), 180);
assert.equal(computeSupplyCustomerUnitPrice(342.62, 80), 616.72);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: false,
    extra_billing_allowed: false,
  }),
  'kuuluu tarjoukseen · suora kulu',
);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: false,
  }),
  'lisälaskutettavissa · ei lupaa',
);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: true,
  }),
  'Lisälaskutettava',
);

const pendingSupply = {
  bill_to_partner: false,
  bill_to_customer: true,
  qty: 1,
  unit_price: 50,
  extra_billable: true,
  extra_billing_allowed: false,
  customer_margin_percent: 80,
};
const pendingImpact = expenseSupplyExtraBillingMarginImpact(pendingSupply);
assert.equal(pendingImpact?.currentMarginImpactNet, -50);
assert.equal(pendingImpact?.marginIfApprovedNet, 40);

const approvedSupply = {
  ...pendingSupply,
  extra_billing_allowed: true,
  customer_unit_price: 90,
};
const approvedImpact = expenseSupplyExtraBillingMarginImpact(approvedSupply);
assert.equal(approvedImpact?.currentMarginImpactNet, 40);
assert.equal(approvedImpact?.marginIfApprovedNet, 40);

assert.match(
  formatExpenseSupplyExtraBillingMarginNote(pendingSupply, (v) => `${v}€`),
  /jos lupa: \+ 40€ kate/,
);
assert.match(
  formatExpenseSupplyExtraBillingMarginNote(approvedSupply, (v) => `${v}€`),
  /Lisälaskutettava · kate \+ 40€/,
);
assert.equal(expenseExtraBillable({ extra_billable: true, extra_billing_allowed: false }), true);
assert.equal(expenseExtraBillable({ extra_billable: undefined, extra_billing_allowed: true }), false);
assert.equal(expenseExtraBillingAllowed({ extra_billable: true, extra_billing_allowed: false }), false);
assert.equal(expenseExtraBillingAllowed({ extra_billable: true, extra_billing_allowed: true }), true);
assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: undefined, extra_billing_allowed: true },
    null,
  ),
  false,
);
assert.equal(
  expenseApprovedExtraBillingCustomerPrintLabel({
    extra_billable: true,
    extra_billing_allowed: true,
  }),
  'Sovitusti laskutettu lisänä',
);
assert.equal(
  expenseApprovedExtraBillingCustomerPrintLabel({
    extra_billable: true,
    extra_billing_allowed: false,
  }),
  null,
);

const pendingPiikki = syncSupplyExpenseCustomerPrice({
  bill_to_partner: false,
  bill_to_customer: true,
  unit_price: '50',
  customer_unit_price: '90',
  extra_billable: true,
  extra_billing_allowed: false,
  customer_margin_percent: '80',
});
assert.equal(resolveExpenseBillingMode(pendingPiikki), 'customer_only');
assert.equal(pendingPiikki.bill_to_customer, true);
assert.equal(pendingPiikki.customer_unit_price, '');

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-12',
    expense_lines: [
      {
        id: 'exp-1',
        description: 'Onninen tarvikkeet',
        qty: 1,
        unit_price: 342.62,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 616.72,
        extra_billable: true,
        extra_billing_allowed: true,
        customer_margin_percent: 80,
      },
      {
        id: 'exp-2',
        description: 'Odottaa lupaa',
        qty: 1,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: true,
        extra_billable: true,
        extra_billing_allowed: false,
        customer_margin_percent: 80,
      },
      {
        id: 'exp-3',
        description: 'Piilotettu tarvike',
        qty: 1,
        unit_price: 25,
        bill_to_partner: false,
        bill_to_customer: false,
        extra_billable: false,
        extra_billing_allowed: false,
      },
    ],
  },
];

const works = extraCustomerWorkFromDailyLogs(logs);
assert.equal(works.length, 1);
assert.equal(works[0].expense_lines?.length, 1);
assert.equal(works[0].expense_lines?.[0].customer_unit_price, 616.72);

const margin = computeQuoteExtrasMarginFromLogs(logs, { hourly_regular: 50 });
assert.equal(margin.customerExtrasNet, 616.72);
assert.equal(margin.piikkiMaterialCostNet, 342.62);

const eating = analyzeMarginEatingExpenses(logs);
assert.equal(eating.total, 25);

const impactLines = collectExtraBillingMarginImpactLines(logs, { hourly_regular: 50 });
assert.equal(impactLines.length, 2);
const approvedLine = impactLines.find((line) => line.status === 'approved');
const pendingLine = impactLines.find((line) => line.status === 'pending');
assert.equal(approvedLine?.marginIfApprovedNet, 274.1);
assert.equal(pendingLine?.currentMarginImpactNet, -50);
assert.equal(pendingLine?.marginIfApprovedNet, 40);
assert.equal(extraBillingMarginImpactStatusLabel(pendingLine), 'Lisälaskutettavissa · ei lupaa');
assert.equal(extraBillingMarginApprovalDelta(pendingLine), 90);
const pendingMarginCell = formatExtraBillingMarginImpactCell(pendingLine, (v) => `${v}€`);
assert.equal(pendingMarginCell.withoutPermission, null);
assert.equal(pendingMarginCell.withPermission, '90€');
const pendingMarginCellTotal = formatExtraBillingMarginImpactCell(pendingLine, (v) => `${v}€`, 1000);
assert.equal(pendingMarginCellTotal.withPermission, '1090€');
assert.equal(computeProjectedNetMarginIfLineApproved(1000, pendingLine), 1090);
assert.equal(computeProjectedNetMarginIfLineApproved(14456.52, {
  ...pendingLine,
  kind: 'extra_work',
  currentMarginImpactNet: 0,
  partnerNet: 0,
  marginIfApprovedNet: 546.52,
}), 15003.04);
assert.equal(computeProjectedNetMarginIfLineApproved(14456.52, {
  ...pendingLine,
  kind: 'extra_work',
  currentMarginImpactNet: -250,
  partnerNet: 250,
  customerNet: 796.52,
  marginIfApprovedNet: 546.52,
}), 15253.04);
const approvedMarginCell = formatExtraBillingMarginImpactCell(approvedLine, (v) => `${v}€`);
assert.equal(approvedMarginCell.approved, '274.1€');
assert.match(
  formatExtraBillingMarginImpactNote(pendingLine, (v) => `${v}€`),
  /puhdas kate luvan kanssa 90€/,
);
assert.equal(expenseExtraBillingAllowed(logs[0].expense_lines[0]), true);
assert.equal(expenseExtraBillingAllowed(logs[0].expense_lines[1]), false);

assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: undefined, extra_billing_allowed: false },
    { extra_billable: true, extra_billing_allowed: false },
  ),
  true,
);
assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: false, extra_billing_allowed: false, customer_unit_price: 180 },
    null,
  ),
  false,
);
assert.equal(
  resolveExpenseExtraBillingAllowedFromSources(
    { extra_billing_allowed: undefined },
    { extra_billable: true, extra_billing_allowed: true },
  ),
  true,
);
assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: undefined, extra_billing_allowed: true },
    { extra_billable: false, extra_billing_allowed: true },
  ),
  false,
);
assert.equal(
  resolveExpenseExtraBillingAllowedFromSources(
    { extra_billable: false, extra_billing_allowed: true },
    { extra_billable: false, extra_billing_allowed: true },
  ),
  false,
);

const tripAndSupplyLines = [
  {
    expense_type: 'km',
    description: 'Ajomatkat (35 km)',
    qty: 35,
    unit_price: 0.5,
  },
  {
    expense_type: 'supply',
    description: 'Tarvike',
    qty: 1,
    unit_price: 50,
    extra_billable: false,
    extra_billing_allowed: true,
  },
];
const tripAndSupplyFlags = [{ extra_billable: false, extra_billing_allowed: false }];
assert.deepEqual(
  resolveSupplyLineFlagForExpenseLine(tripAndSupplyLines[1], 1, tripAndSupplyLines, tripAndSupplyFlags),
  tripAndSupplyFlags[0],
);

const turnedOffDrafts = [
  {
    expense_type: 'supply',
    description: 'Tarvike',
    qty: '1',
    unit_price: '50',
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: false,
    extra_billing_allowed: false,
    customer_margin_percent: '80',
  },
];
const turnedOffBilling = buildCustomerExtraBillingFromLogForm(
  {
    hours_extra_billable: false,
    hours_extra_billing_allowed: false,
    hours_extra_hours: '',
    extra_expense_description: '',
    extra_expense_qty: '1',
    extra_expense_customer_price: '',
    extra_expense_purchase_price: '',
    extra_expense_partner_billing: 'charge',
    entry_type: 'regular',
    hours_regular: '8',
    hours_overtime: '',
    hours_on_call: '',
    work_done: 'Työ',
    customer_hourly_rate_override: '',
  },
  turnedOffDrafts,
);
assert.equal(dailyLogCustomerExtraBillingHasData(turnedOffBilling), true);
assert.equal(turnedOffBilling.supply_line_flags?.[0]?.extra_billable, false);
const turnedOffSerialized = serializeDailyLogCustomerExtraBilling(turnedOffBilling);
assert.equal(turnedOffSerialized.supply_line_flags?.[0]?.extra_billable, false);

const turnedOffHours = buildCustomerExtraBillingFromLogForm(
  {
    hours_extra_billable: false,
    hours_extra_billing_allowed: false,
    hours_extra_hours: '',
    extra_expense_description: '',
    extra_expense_qty: '1',
    extra_expense_customer_price: '',
    extra_expense_purchase_price: '',
    extra_expense_partner_billing: 'charge',
    entry_type: 'regular',
    hours_regular: '8',
    hours_overtime: '',
    hours_on_call: '',
    work_done: 'Työ',
    customer_hourly_rate_override: '',
  },
  [],
);
assert.equal(turnedOffHours.hours_extra_billable, false);
assert.equal(serializeDailyLogCustomerExtraBilling(turnedOffHours).hours_extra_billable, false);
assert.equal(
  dailyLogExtraBillingToForm({
    hours_extra_billable: false,
    hours_extra_billing_allowed: false,
    hours: 5,
  }).hours_extra_billable,
  false,
);

const stalePermissionLine = {
  expense_type: 'supply',
  description: 'Tarvike',
  qty: 1,
  unit_price: 50,
  bill_to_partner: false,
  bill_to_customer: true,
  extra_billing_allowed: true,
};
const stalePermissionFlags = [{ extra_billable: false, extra_billing_allowed: false }];
assert.equal(
  resolveExpenseExtraBillableFromSources(stalePermissionLine, stalePermissionFlags[0]),
  false,
);
assert.equal(
  resolveExpenseExtraBillingAllowedFromSources(stalePermissionLine, stalePermissionFlags[0]),
  false,
);

const expenseDrafts = [
  {
    expense_type: 'supply',
    description: 'Onninen',
    qty: '1',
    unit_price: '50',
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: false,
    customer_margin_percent: '80',
  },
];
const flags = buildSupplyLineFlagsFromExpenseDrafts(expenseDrafts);
assert.equal(flags.length, 1);
assert.equal(flags[0].extra_billable, true);

const serialized = serializeDailyLogCustomerExtraBilling(
  buildCustomerExtraBillingFromLogForm(
    {
      hours_extra_billable: false,
      hours_extra_billing_allowed: false,
      hours_extra_hours: '',
      extra_expense_description: '',
      extra_expense_qty: '1',
      extra_expense_customer_price: '',
      extra_expense_purchase_price: '',
      extra_expense_partner_billing: 'charge',
      entry_type: 'regular',
      hours_regular: '8',
      hours_overtime: '',
      hours_on_call: '',
      work_done: 'Työ',
      customer_hourly_rate_override: '',
    },
    expenseDrafts,
  ),
);
const parsed = parseDailyLogCustomerExtraBilling(serialized);
assert.equal(parsed.supply_line_flags?.[0]?.extra_billable, true);
assert.equal(parsed.supply_line_flags?.[0]?.extra_billing_allowed, false);

const quoteSettings = {
  quote_sale_net: 20000,
  quote_purchase_net: 5000,
  actual_purchase_net: 5000,
  purchase_lines: [
    {
      id: 'device:1',
      label: 'Laite',
      source: 'device',
      quote_purchase_net: 4316.85,
      actual_purchase_net: 4316.85,
    },
    {
      id: 'group:diary-supplies',
      label: 'Tarvikkeet',
      source: 'group',
      quote_purchase_net: 683.15,
      actual_purchase_net: 683.15,
    },
  ],
};
const supplyExpense = {
  description: 'Onninen',
  qty: 1,
  unit_price: 683.15,
  bill_to_partner: false,
  bill_to_customer: true,
  customer_margin_percent: 80,
  extra_billable: true,
};
const pendingSupplyLogs = [
  {
    id: 'log-supply',
    log_date: '2026-09-12',
    expense_lines: [{ ...supplyExpense, extra_billing_allowed: false }],
  },
];
const approvedSupplyLogs = [
  {
    id: 'log-supply',
    log_date: '2026-09-12',
    expense_lines: [
      {
        ...supplyExpense,
        extra_billing_allowed: true,
        customer_unit_price: 1229.67,
      },
    ],
  },
];
const pendingSupplyMargin = computePartnerNetMargin(
  mergeActualPurchaseFromWorkReportLogs(quoteSettings, pendingSupplyLogs),
  5000,
  { logs: pendingSupplyLogs, partnerRates: { hourly_regular: 50 } },
);
const approvedSupplyMargin = computePartnerNetMargin(
  mergeActualPurchaseFromWorkReportLogs(quoteSettings, approvedSupplyLogs),
  5000,
  { logs: approvedSupplyLogs, partnerRates: { hourly_regular: 50 } },
);
const pendingSupplyImpact = collectExtraBillingMarginImpactLines(pendingSupplyLogs, {
  hourly_regular: 50,
})[0];
assert.equal(pendingSupplyImpact.currentMarginImpactNet, -683.15);
assert.equal(pendingSupplyImpact.marginIfApprovedNet, 546.52);
assert.equal(extraBillingMarginApprovalDelta(pendingSupplyImpact), 1229.67);
assert.equal(
  computeProjectedNetMarginIfLineApproved(
    pendingSupplyMargin?.netMarginNet ?? 0,
    pendingSupplyImpact,
  ),
  approvedSupplyMargin?.netMarginNet,
);

const users = [{ id: 'u1', display_name: 'Matti', bill_hours_enabled: true, bill_expenses_enabled: true }];
const partnerRates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 85 };
const pendingHoursLogs = [
  {
    id: 'log-hours',
    log_date: '2026-09-12',
    entry_type: 'regular',
    hours_regular: 10,
    created_by: 'u1',
    customer_extra_billing: {
      hours_extra_billable: true,
      hours_extra_billing_allowed: false,
      hours: 5,
      hourly_rate: 159.304,
      description: 'Lisätyö',
    },
  },
];
const approvedHoursLogs = [
  {
    ...pendingHoursLogs[0],
    customer_extra_billing: {
      ...pendingHoursLogs[0].customer_extra_billing,
      hours_extra_billing_allowed: true,
    },
  },
];
const pendingHoursPartner = mergePartnerExtraBillingFromDailyLogs(
  calculateWorkReportBillable({
    logs: pendingHoursLogs,
    users,
    rates: partnerRates,
    ratesSource: 'partnership',
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner',
  }),
  { logs: pendingHoursLogs, rates: partnerRates, users },
);
const approvedHoursPartner = mergePartnerExtraBillingFromDailyLogs(
  calculateWorkReportBillable({
    logs: approvedHoursLogs,
    users,
    rates: partnerRates,
    ratesSource: 'partnership',
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner',
  }),
  { logs: approvedHoursLogs, rates: partnerRates, users },
);
const pendingHoursMargin = computePartnerNetMargin(
  mergeActualPurchaseFromWorkReportLogs(quoteSettings, pendingHoursLogs),
  pendingHoursPartner.grandTotal,
  {
    logs: pendingHoursLogs,
    partnerRates,
    partnerCalculation: pendingHoursPartner,
  },
);
const approvedHoursMargin = computePartnerNetMargin(
  mergeActualPurchaseFromWorkReportLogs(quoteSettings, approvedHoursLogs),
  approvedHoursPartner.grandTotal,
  {
    logs: approvedHoursLogs,
    partnerRates,
    partnerCalculation: approvedHoursPartner,
  },
);
const pendingHoursImpact = collectExtraBillingMarginImpactLines(pendingHoursLogs, partnerRates)[0];
assert.equal(pendingHoursImpact.currentMarginImpactNet, -250);
assert.equal(pendingHoursImpact.marginIfApprovedNet, 546.5);
assert.equal(
  computeProjectedNetMarginIfLineApproved(
    pendingHoursMargin?.netMarginNet ?? 0,
    pendingHoursImpact,
  ),
  approvedHoursMargin?.netMarginNet,
);

console.log('test-expense-supply-extra-billing: ok');
