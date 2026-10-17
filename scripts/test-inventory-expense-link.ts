import assert from 'node:assert/strict';
import { applyInventoryPick, marginPercentFromPrices, searchInventoryItems, projectedStock } from '../src/lib/inventoryExpenseLink';
import { emptyExpense } from '../src/lib/dailyLogExpenseDraft';

const items = [
  { id: 'a', name: 'Kupariputki 12mm', sku: 'CU12', unit: 'm', qty_on_hand: 25, purchase_price: 4, sale_price: 6 },
  { id: 'b', name: 'Eristeputki', sku: null, unit: 'm', qty_on_hand: 10, purchase_price: null, sale_price: null },
];
assert.equal(searchInventoryItems(items, 'cu12')[0].id, 'a');
assert.equal(searchInventoryItems(items, 'putki').length, 2);
assert.equal(searchInventoryItems(items, 'kupari 12')[0].id, 'a');
assert.equal(marginPercentFromPrices(4, 6), 50);
assert.equal(marginPercentFromPrices(null, 6), null);
const row = applyInventoryPick({ ...emptyExpense(), qty: '3' }, items[0]);
assert.equal(row.inventory_item_id, 'a');
assert.equal(row.unit, 'm');
assert.equal(row.expense_type, 'material');
assert.equal(row.unit_price, '4');
assert.equal(row.customer_unit_price, '6');
assert.equal(row.customer_margin_percent, '50');
assert.equal(row.qty, '3');
assert.equal(row.description, 'Kupariputki 12mm (CU12)');
// Kate: 3 × (6 − 4) = 6 € alv 0 %
assert.equal(3 * (Number(row.customer_unit_price) - Number(row.unit_price)), 6);
const r2 = applyInventoryPick({ ...emptyExpense(), unit_price: '9' }, items[1]);
assert.equal(r2.unit_price, '9');
assert.equal(projectedStock(items[0], 3), 22);
assert.equal(projectedStock(items[0], 5, 3), 23);
console.log('inventory-expense-link ok');
