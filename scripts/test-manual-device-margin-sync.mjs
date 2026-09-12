import assert from 'node:assert/strict';
import {
  computeManualDeviceMarginPercent,
  resolveNonPumpDeviceSellNet,
  syncManualDeviceSalePatch,
} from '../src/lib/quoteRequest/manualDevicePricing.ts';

const base = {
  devicePurchaseOverrideNet: 10000,
  deviceMarginPercent: 25,
  deviceSaleOverrideNet: null,
};

const initial = syncManualDeviceSalePatch(base, { deviceMarginPercent: 25 });
assert.equal(initial.deviceSaleOverrideNet, 12500);
assert.equal(resolveNonPumpDeviceSellNet({ ...base, ...initial }), 12500);

const afterPurchase = syncManualDeviceSalePatch(
  { ...base, deviceSaleOverrideNet: 12500 },
  { devicePurchaseOverrideNet: 12000 },
);
assert.equal(afterPurchase.deviceSaleOverrideNet, 12500);
assert.equal(afterPurchase.deviceMarginPercent, 4.17);
assert.equal(computeManualDeviceMarginPercent(12000, 12500), 4.17);

console.log('test-manual-device-margin-sync: ok');
