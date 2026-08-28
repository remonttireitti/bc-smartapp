import assert from 'node:assert/strict';
import { refrigerantWarehouseStockUnchanged } from '../src/lib/refrigerantInventory.ts';

const baseLine = {
  source: 'warehouse',
  cylinder_id: 'cyl-1',
  qty_kg: 2,
  cylinder_disposition: 'partial_in_stock',
};

const baseDraft = {
  source: 'warehouse',
  cylinder_id: 'cyl-1',
  qty_kg: '2',
  cylinder_disposition: 'partial_in_stock',
};

assert.equal(refrigerantWarehouseStockUnchanged(baseLine, baseDraft), true);

assert.equal(
  refrigerantWarehouseStockUnchanged(baseLine, { ...baseDraft, qty_kg: '5' }),
  false,
);

assert.equal(
  refrigerantWarehouseStockUnchanged(baseLine, { ...baseDraft, cylinder_id: 'cyl-2' }),
  false,
);

assert.equal(
  refrigerantWarehouseStockUnchanged(baseLine, { ...baseDraft, qty_kg: '2' }),
  true,
);

assert.equal(
  refrigerantWarehouseStockUnchanged(
    { ...baseLine, source: 'partner_warehouse' },
    { ...baseDraft, source: 'partner_warehouse' },
  ),
  true,
);

console.log('test-refrigerant-warehouse-stock-unchanged: ok');
