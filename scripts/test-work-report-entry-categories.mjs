import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import {
  classifyExpenseLineCategory,
  collectWorkReportCategoryEntries,
} from '../src/lib/workReportEntryCategories.ts';

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-12',
    entry_type: 'regular',
    hours_regular: 8,
    work_done: 'Asennus',
    expense_lines: [
      {
        id: 'e1',
        expense_type: 'material',
        description: 'Liitin',
        qty: 2,
        unit_price: 20,
        bill_to_partner: true,
        bill_to_customer: true,
      },
      {
        id: 'e2',
        description: 'Kierreletku',
        qty: 1,
        unit_price: 45,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 81,
      },
    ],
  },
];

assert.equal(classifyExpenseLineCategory(logs[0].expense_lines[0]), 'expenses');
assert.equal(classifyExpenseLineCategory(logs[0].expense_lines[1]), 'supplies');

const partnerCalculation = calculateWorkReportBillable({
  logs,
  users: [{ id: 'u1', display_name: 'Tekijä', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: 'company_default',
  tripKmRate: 0.65,
});

const entries = collectWorkReportCategoryEntries(logs, partnerCalculation);
assert.ok(entries.some((entry) => entry.category === 'labor' && entry.qty === 8));
assert.ok(entries.some((entry) => entry.category === 'expenses' && entry.description === 'Liitin'));
assert.ok(entries.some((entry) => entry.category === 'supplies' && entry.description === 'Kierreletku'));

console.log('test-work-report-entry-categories: ok');
