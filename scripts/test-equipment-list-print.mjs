import assert from 'node:assert/strict';
import {
  buildEquipmentListPrintHtml,
  buildEquipmentListPrintRow,
} from '../src/lib/equipmentListPrintHtml.ts';

const row = buildEquipmentListPrintRow({
  id: 'eq-1',
  name: 'Pakastin 1',
  tag: 'P-01',
  customer_id: 'cust-1',
  device_type: 'pakastin',
  location: 'Keittiö',
  huolto_technical_snapshot: {
    laiteKayttotarkoitus: 'Elintarvikemyynti',
    laiteSijainti: 'Keittiö',
    kylmaaineTyyppi: 'R-404A',
    kylmaaineMaaraYhteensa: '2.5',
    kylmaaineCO2Ekv: '5.1',
  },
});

assert.equal(row.tag, 'P-01');
assert.equal(row.type, 'Pakastin');
assert.equal(row.effectArea, 'Elintarvikemyynti');
assert.equal(row.location, 'Keittiö');
assert.equal(row.refrigerant, 'R-404A');
assert.equal(row.refrigerantQty, '2.5 kg');
assert.equal(row.co2Ekv, '5.1 t');

const html = buildEquipmentListPrintHtml({
  customerName: 'Testi Oy',
  equipment: [
    {
      id: 'eq-1',
      name: 'Pakastin 1',
      tag: 'P-01',
      customer_id: 'cust-1',
      device_type: 'pakastin',
      location: 'Keittiö',
      huolto_technical_snapshot: {
        laiteKayttotarkoitus: 'Elintarvikemyynti',
        kylmaaineTyyppi: 'R-404A',
        kylmaaineMaaraYhteensa: '2.5',
        kylmaaineCO2Ekv: '5.1',
      },
    },
  ],
  branding: { companyName: 'Testi Huolto', logoUrl: null },
});

assert.match(html, /Laiteluettelo/);
assert.match(html, /Vaikutusalue/);
assert.match(html, /R-404A/);
assert.match(html, /5\.1 t/);

console.log('test-equipment-list-print: ok');
