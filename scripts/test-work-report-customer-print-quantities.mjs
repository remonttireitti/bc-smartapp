import assert from 'node:assert/strict';
import {
  DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  parseCustomerPrintQuantitySettings,
  serializeCustomerPrintQuantitySettings,
} from '../src/lib/workReportCustomerPrintSettings.ts';
import {
  formatCustomerPrintExpenseQuantity,
  formatCustomerPrintHourSummary,
  formatCustomerPrintRefrigerantQuantity,
} from '../src/lib/workReportCustomerPrintQuantity.ts';

assert.equal(
  formatCustomerPrintExpenseQuantity('part', 2, DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  '2 kpl',
);
assert.equal(
  formatCustomerPrintExpenseQuantity('km', 95.8, DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  '95.8 km',
);
assert.equal(formatCustomerPrintRefrigerantQuantity(1.25), '1.25 kg');
assert.equal(
  formatCustomerPrintHourSummary(
    { entry_type: 'regular', hours_regular: 3, hours_overtime: 0, hours_on_call: 0 },
    DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  ),
  '3 h',
);
assert.equal(
  formatCustomerPrintHourSummary(
    { entry_type: 'fixed_price', hours_regular: 0, hours_overtime: 0, hours_on_call: 0 },
    DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  ),
  'urakka',
);

const hiddenHours = {
  ...DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  showHourQuantities: false,
};
assert.equal(
  formatCustomerPrintHourSummary(
    { entry_type: 'regular', hours_regular: 3, hours_overtime: 0, hours_on_call: 0 },
    hiddenHours,
  ),
  null,
);

const params = serializeCustomerPrintQuantitySettings({
  ...DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  showQuantities: false,
});
assert.equal(parseCustomerPrintQuantitySettings(params).showQuantities, false);
assert.equal(parseCustomerPrintQuantitySettings(params).showHourQuantities, false);

const customUnitParams = serializeCustomerPrintQuantitySettings({
  ...DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  expenseUnits: { ...DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS.expenseUnits, part: 'erä' },
});
assert.equal(
  parseCustomerPrintQuantitySettings(customUnitParams).expenseUnits.part,
  'erä',
);

console.log('test-work-report-customer-print-quantities: ok');
