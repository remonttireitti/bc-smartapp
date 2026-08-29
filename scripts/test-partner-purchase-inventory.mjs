import assert from 'node:assert/strict';
import {
  materialQtyDelta,
  parsePartnerPurchaseInventoryKind,
  targetToolCount,
} from '../src/lib/partnerPurchaseInventory.ts';

assert.equal(parsePartnerPurchaseInventoryKind('tool'), 'tool');
assert.equal(parsePartnerPurchaseInventoryKind('material'), 'material');
assert.equal(parsePartnerPurchaseInventoryKind(''), null);
assert.equal(parsePartnerPurchaseInventoryKind(null), null);

assert.equal(targetToolCount(2), 2);
assert.equal(targetToolCount(2.9), 2);
assert.equal(targetToolCount(0.5), 0);

assert.equal(materialQtyDelta(2, 5), 3);
assert.equal(materialQtyDelta(5, 3), -2);
assert.equal(materialQtyDelta(null, 4), 4);

console.log('test-partner-purchase-inventory: ok');
