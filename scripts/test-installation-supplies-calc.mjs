import assert from 'node:assert/strict';
import {
  computeInstallationSupplyMarginPercent,
  computeInstallationSupplySellPrice,
  installationSuppliesProductMarginNet,
  installationSuppliesPurchaseNet,
  installationSuppliesSellNet,
  syncInstallationSupplyRow,
} from '../src/lib/quoteRequest/installationSupplies.ts';

const baseRow = {
  id: 'row-1',
  name: 'Kupriputki',
  quantity: 30,
  purchasePrice: 30,
  marginPercent: 10,
  sellPrice: 0,
};

// Hankinta 30 €, kate 10 % → myynti 33 €/kpl (ei 990 €)
const fromMargin = syncInstallationSupplyRow(baseRow, { marginPercent: 10 });
assert.equal(computeInstallationSupplySellPrice(30, 10), 33);
assert.equal(fromMargin.sellPrice, 33);
assert.equal(fromMargin.quantity * fromMargin.sellPrice, 990);

const items = [fromMargin];
assert.equal(installationSuppliesPurchaseNet(items), 900);
assert.equal(installationSuppliesSellNet(items), 990);
assert.equal(installationSuppliesProductMarginNet({ installationSupplies: items }), 90);

// Myyntihinnan muutos päivittää kate-%:n
const fromSell = syncInstallationSupplyRow(
  { ...baseRow, purchasePrice: 100, marginPercent: 25, sellPrice: 150 },
  { sellPrice: 125 },
);
assert.equal(fromSell.sellPrice, 125);
assert.equal(fromSell.marginPercent, 25);

// Määrän muutos ei muuta kappalehintaa
const fromQty = syncInstallationSupplyRow(fromMargin, { quantity: 50 });
assert.equal(fromQty.sellPrice, 33);
assert.equal(fromQty.marginPercent, 10);
assert.equal(fromQty.quantity * fromQty.sellPrice, 1650);

assert.equal(computeInstallationSupplyMarginPercent(30, 33), 10);
assert.equal(computeInstallationSupplyMarginPercent(0, 50), 0);

// Hankinta muuttuu, myynti lukittu → kate-% päivittyy
const purchaseUp = syncInstallationSupplyRow(
  { ...fromMargin, purchasePrice: 30, sellPrice: 33, marginPercent: 10 },
  { purchasePrice: 40 },
);
assert.equal(purchaseUp.sellPrice, 33);
assert.equal(purchaseUp.marginPercent, -17.5);

const purchaseUpMore = syncInstallationSupplyRow(
  { ...fromMargin, purchasePrice: 30, sellPrice: 33, marginPercent: 10 },
  { purchasePrice: 36 },
);
assert.equal(purchaseUpMore.sellPrice, 33);
assert.equal(purchaseUpMore.marginPercent, -8.33);

console.log('installation-supplies-calc: ok');
