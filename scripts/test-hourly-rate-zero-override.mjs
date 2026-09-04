import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import {
  formatHourlyRateOverrideForForm,
  parseOptionalHourlyRateOverride,
  resolveStoredHourlyRateOverride,
} from '../src/lib/workReportHourlyRateOverride.ts';

assert.equal(parseOptionalHourlyRateOverride(''), null);
assert.equal(parseOptionalHourlyRateOverride('0'), 0);
assert.equal(parseOptionalHourlyRateOverride('65'), 65);
assert.equal(formatHourlyRateOverrideForForm(0), '0');
assert.equal(formatHourlyRateOverrideForForm(null), '');
assert.equal(resolveStoredHourlyRateOverride(0), 0);

const log = {
  id: 'log-1',
  work_report_id: 'wr-1',
  log_date: '2026-09-04',
  entry_type: 'regular',
  hours_regular: 2,
  hours_overtime: 0,
  hours_on_call: 0,
  fixed_price_amount: null,
  customer_fixed_price_amount: null,
  hourly_rate_override: 0,
  customer_hourly_rate_override: 0,
  commission_amount: 0,
  commission_note: null,
  work_done: 'Takuutyö',
  created_by: 'user-1',
  created_at: '2026-09-04T08:00:00Z',
  updated_at: '2026-09-04T08:00:00Z',
};

const partnerCalc = calculateWorkReportBillable({
  logs: [log],
  rates: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: 'partnership',
  billToCompanyId: 'partner-1',
  billToCompanyName: 'Kumppani',
  users: [{ id: 'user-1', display_name: 'Tekijä', bill_hours_enabled: true, bill_expenses_enabled: true }],
});

assert.equal(partnerCalc.grandTotal, 0);

const customerCalc = calculateWorkReportCustomerBillable({
  logs: [log],
  rates: { hourly_regular: 65, hourly_overtime: 90, hourly_on_call: 120 },
  ratesSource: 'company_default',
  customerName: 'Asiakas',
});

assert.equal(customerCalc.grandTotal, 0);

console.log('test-hourly-rate-zero-override: ok');
