import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';

const users = [{ id: 'u1', display_name: 'Enn Kotselainen', bill_hours_enabled: true, bill_expenses_enabled: true }];
const partnerRates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const customerRates = { hourly_regular: 65, hourly_overtime: 85, hourly_on_call: 110 };

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-17',
    entry_type: 'regular',
    hours_regular: 3,
    created_by: 'u1',
    commission_amount: 202.34,
    commission_note: 'provisio 50 % puhtaasta katteesta',
    expense_lines: [
      {
        id: 'exp-1',
        expense_type: 'supply',
        description: 'Rhoss ohjauskortti',
        qty: 1,
        unit_price: 400.5,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 720.9,
      },
      {
        id: 'exp-2',
        expense_type: 'km',
        description: 'Ajomatkat (95.8 km)',
        qty: 95.8,
        unit_price: 0.59,
        bill_to_partner: true,
        bill_to_customer: true,
        customer_unit_price: 1,
      },
    ],
  },
];

const partnerCalc = calculateWorkReportBillable({
  logs,
  users,
  rates: partnerRates,
  ratesSource: 'partnership',
  billToCompanyId: 'owner',
  billToCompanyName: 'Lämpökatsastus Oy',
});

const customerCalc = calculateWorkReportCustomerBillable({
  logs,
  rates: customerRates,
  ratesSource: 'company',
  customerName: 'ISS Palvelut Oy',
});

assert.equal(partnerCalc.commissionTotal ?? partnerCalc.byUser[0]?.commissionTotal, 202.34);
assert.equal(customerCalc.commissionTotal ?? customerCalc.byUser[0]?.commissionTotal, 0);
assert.equal(
  customerCalc.byUser.flatMap((user) => user.lines).some((line) => line.kind === 'commission'),
  false,
);
assert.equal(customerCalc.grandTotal, 1011.7);

console.log('test-commission-customer-billing: ok');
