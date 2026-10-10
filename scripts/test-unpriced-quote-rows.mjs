/**
 * Hinnattomat tarjousrivit: näkyvät tarjouspyynnön hinnalla (tiedoksi) ja lasketaan
 * alustavaksi kuluksi, jotta tuomio ei näytä liian hyvältä (Wärtsilä 293ec669: +4648 € → +1662 €).
 */
import assert from 'node:assert/strict';
import { collectUnpricedQuoteRows, unpricedQuoteRowTotals } from '../src/lib/quoteSeededRows.ts';
import { buildQuoteOutcomeSummary } from '../src/lib/quoteOutcomeSummary.ts';

const fe = (v) => `${v.toFixed(2)} €`;
const qid = 'q1';
const settings = {
  quote_request_id: qid,
  purchase_lines: [
    { id: 'material:a', label: 'Kupariputki', quote_purchase_net: 580 },
    { id: 'group:installation-internal', label: 'Asennustyö', quote_purchase_net: 3300 },
    { id: 'material:b', label: 'Majoitus', quote_purchase_net: 300 },
    { id: 'material:c', label: 'Eristeet', quote_purchase_net: 150 },
  ],
  quote_seeded_rows: {
    quote_request_id: qid,
    lines: [
      { id: 'material:a', description: 'Kupariputki', expense_type: 'material', qty: 2 },
      { id: 'material:b', description: 'Majoitus', expense_type: 'material', qty: 3 },
    ],
  },
};
const zero = { unit_price: 0, customer_unit_price: null, bill_to_partner: false, bill_to_customer: false };
const logs = [
  {
    id: 'l2', log_date: '2026-10-09',
    expense_lines: [{ id: 'x', expense_type: 'km', description: 'Ajot', qty: 10, unit_price: 0.59 }],
  },
  {
    id: 'l1', log_date: '2026-10-06',
    expense_lines: [
      { id: 'e1', expense_type: 'material', description: 'Kupariputki', qty: 2, ...zero },
      { id: 'e2', expense_type: 'material', description: 'Majoitus', qty: 3, ...zero },
      { id: 'e3', expense_type: 'material', description: 'Eristeet', qty: 1, ...zero },
      { id: 'e4', expense_type: 'material', description: 'Oma tarvike', qty: 1, ...zero },
      { id: 'e5', expense_type: 'material', description: 'Hinnoiteltu', qty: 1, unit_price: 10 },
    ],
  },
];
const rows = collectUnpricedQuoteRows(logs, settings);
assert.deepEqual(rows.map((r) => [r.description, r.quoteNet]), [
  ['Kupariputki', 580], ['Majoitus', 300], ['Eristeet', 150], ['Oma tarvike', null],
]);
assert.deepEqual(unpricedQuoteRowTotals(rows), { supplies: 1030, expenses: 0 });
assert.deepEqual(collectUnpricedQuoteRows(logs, null).map((r) => r.quoteNet), [null, null, null, null]);

// Wärtsilä-luvut: tarjous 16069,20; arvio työ 2900, tarvikkeet 2160, kulut 1578,60, laite 4174.
const comparison = {
  rows: [
    { key: 'labor', label: 'Työt', quoteNet: 2900, actualNet: 1750 },
    { key: 'supplies', label: 'Tarvikkeet', quoteNet: 2160, actualNet: 0 },
    { key: 'expenses', label: 'Kulut', quoteNet: 1578.6, actualNet: 240.6 },
    { key: 'device', label: 'Laite', quoteNet: 4174, actualNet: 5000 },
  ],
  quoteTotalNet: 10812.6,
  actualTotalNet: 6990.6,
};
const partnerMargin = {
  quoteSaleNet: 16069.2, customerExtrasNet: 0, grossMarginNet: 9078.6, netMarginNet: 9078.6,
  commissionNet: 0, commissionPercent: 0, commissionSource: 'percent',
  deductionRows: [
    { key: 'labor_expenses', label: 'Työ ja kulut', amount: 1990.6 },
    { key: 'device', label: 'Laite', amount: 5000 },
  ],
};
const before = buildQuoteOutcomeSummary({ partnerMargin, comparison, formatEuro: fe });
assert.equal(before.verdict.amountNet, 3822);
const after = buildQuoteOutcomeSummary({
  partnerMargin, comparison, formatEuro: fe, provisionalCosts: { supplies: 2160, expenses: 0 },
});
assert.equal(after.costs.actualNet, 9150.6);
assert.equal(after.grossMargin.actualNet, 6918.6);
assert.equal(after.grossMargin.estimateNet, 5256.6);
assert.equal(after.verdict.amountNet, 1662);
assert.equal(after.netMarginNet, 6918.6);
assert.equal(after.rows.find((r) => r.key === 'supplies').actualNet, 2160);
assert.equal(after.parties, null);
console.log('test-unpriced-quote-rows: OK');

// Hinnan syöttö taulukosta: suomalainen desimaali, tyhjä ei tallennu; hinnoiteltu rivi poistuu listalta.
const { parsePriceInput } = await import('../src/components/UnpricedQuoteRowsTable.tsx');
assert.equal(parsePriceInput('12,5'), 12.5);
assert.equal(parsePriceInput('1 200 €'), 1200);
assert.equal(parsePriceInput(''), null);
assert.equal(parsePriceInput('abc'), null);
assert.equal(rows[0].lineId, 'e1');
const priced = logs.map((l) => ({ ...l, expense_lines: l.expense_lines.map((x) => (x.id === 'e1' ? { ...x, unit_price: 250 } : x)) }));
const left = collectUnpricedQuoteRows(priced, settings);
assert.equal(left.length, 3);
assert.deepEqual(unpricedQuoteRowTotals(left), { supplies: 450, expenses: 0 });
console.log('test-unpriced-quote-rows (input): OK');
