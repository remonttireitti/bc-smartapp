import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
const partnerRates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const quoteData = {
  type: 'huolto', workItems: [{id:'a',hours:10,materials:[],description:'Ajoaika',pricePerHour:65},{id:'b',hours:40,materials:[],description:'Huolto',pricePerHour:65}],
  laborHours: 2, travelKmRate: 0.53, travelKmEnabled:false, travelKmDistance:0, installationLaborHours:50, installationLaborPurchaseRate:50,
  installationVehicleAllowance:50, installationVehicleHoursPerBlock:8,
  installationSupplies: [
    {id:'1',name:'Huoltotarvikkeet',rowKind:'supply',quantity:30,sellPrice:45,marginPercent:80,purchasePrice:25},
    {id:'2',name:'Majoitus',rowKind:'expense',quantity:5,sellPrice:200,marginPercent:100,purchasePrice:100},
    {id:'3',name:'Km korvaus',unit:'km',rowKind:'expense',quantity:800,sellPrice:1.2,marginPercent:20,purchasePrice:1},
  ],
};
const mk = (id, date, h, legs, exp) => ({ id, work_report_id:'wr', log_date:date, entry_type:'regular', hours_regular:h, hours_overtime:0, hours_on_call:0, trip_legs:legs, expense_lines:exp, created_by:'u1', created_at:date+'T10:00:00Z', customer_extra_billing:{} });
const km = (d)=>({expense_type:'km',description:`Ajomatkat (${d} km)`,qty:d,unit_price:0.9,customer_unit_price:1,bill_to_partner:true,bill_to_customer:true});
const logs = [
  mk('l1','2026-11-01',5,[{distance_km:408.3}],[km(408.3)]),
  mk('l2','2026-11-03',10,[],[{expense_type:'material',description:'Huoltotarvikkeet',qty:30,unit_price:0,bill_to_partner:false,bill_to_customer:false},{expense_type:'other',description:'Majoitus',qty:5,unit_price:56,bill_to_partner:false,bill_to_customer:false}]),
  mk('l3','2026-11-04',5,[],[]),
  mk('l4','2026-11-05',5,[{distance_km:406.9}],[km(406.9)]),
];
const users=[{id:'u1',display_name:'T',bill_hours_enabled:true,bill_expenses_enabled:true}];
const calc = calculateWorkReportBillable({logs,users,rates:partnerRates,ratesSource:'company_default',tripKmRate:0.53});
const settings = mergeActualPurchaseFromWorkReportLogs({purchase_lines: extractQuotePurchaseLines(quoteData)}, logs, quoteData);

import assert from 'node:assert/strict';
import { buildQuoteOutcomeSummary, buildAccountingStatement } from '../src/lib/quoteOutcomeSummary.ts';
import { formatEuro } from '../src/lib/workReportBilling.ts';

const run = (logsIn) => {
  const calc = calculateWorkReportBillable({ logs: logsIn, users, rates: partnerRates, ratesSource: 'company_default', tripKmRate: 0.53 });
  const settings = mergeActualPurchaseFromWorkReportLogs({ purchase_lines: extractQuotePurchaseLines(quoteData) }, logsIn, quoteData);
  return compareQuoteCategories({ quoteData, partnerCalculation: calc, logs: logsIn, partnerRates, tripKmRate: 0.53, billingSettings: settings });
};

// Wärtsilä-tapaus: tarjous 800 km (Km korvaus -rivi), ajettu 815,2 km, majoitus oma kulu.
const cmp = run(logs);
const expenses = cmp.rows.find((r) => r.key === 'expenses');
assert.equal(expenses.quoteQty, 800, 'tarjouksen km ei tuplaannu (oli 1600)');
assert.equal(expenses.actualQty, 815.2);
// 500 majoitus + 800 km-korvaus + 350 huoltoauto (ei enää 800 km × 0,53 päälle)
assert.equal(expenses.quoteNet, 1650);
assert.equal(expenses.actualNet, 1013.68);
const parts = Object.fromEntries(expenses.parts.map((p) => [p.key, p]));
assert.equal(parts.travel.quoteNet, 800);
assert.equal(parts.travel.actualNet, 733.68);
assert.equal(parts.accommodation.quoteNet, 500);
assert.equal(parts.accommodation.actualNet, 280);
assert.match(parts.accommodation.note, /oma kulu · ei laskuteta kumppanilta/);
assert.equal(parts.vehicle.quoteNet, 350);
assert.equal(Math.round(expenses.parts.reduce((s, p) => s + p.quoteNet, 0) * 100) / 100, expenses.quoteNet);
assert.equal(Math.round(expenses.parts.reduce((s, p) => s + p.actualNet, 0) * 100) / 100, expenses.actualNet);
assert.equal(cmp.quoteTotalNet, 2500 + 750 + 1650);

// Majoitus laskutetaan kumppanilta -> sama kulu, selite kertoo laskutuksen.
const billedLogs = logs.map((log) => ({
  ...log,
  expense_lines: (log.expense_lines ?? []).map((e) =>
    e.description === 'Majoitus' ? { ...e, bill_to_partner: true, bill_to_customer: true } : e),
}));
const cmpBilled = run(billedLogs);
const exp2 = cmpBilled.rows.find((r) => r.key === 'expenses');
assert.equal(exp2.actualNet, 1013.68, 'majoitus lasketaan kuluksi laskutustavasta riippumatta, kerran');
assert.match(exp2.parts.find((p) => p.key === 'accommodation').note, /oma kulu · laskutetaan kumppanilta/);

// Yhteenvedon Kulut-osio: ajot, majoitus, huoltoauto omina riveinään, ei "1600 km / 815,2 km".
const summary = buildQuoteOutcomeSummary({ partnerMargin: null, comparison: cmp, quoteSaleNet: 6560, formatEuro });
const statement = buildAccountingStatement(summary);
const labels = statement.costs.map((l) => l.label);
assert.deepEqual(labels, ['Työt', 'Tarvikkeet', 'Ajokilometrit', 'Majoitus', 'Huoltoautokorvaus', 'Kulut yhteensä']);
const travelLine = statement.costs.find((l) => l.label === 'Ajokilometrit');
assert.match(travelLine.sub, /^800 km \/ 815,2 km$/);
assert.equal(new Set(statement.costs.map((l) => l.key)).size, statement.costs.length, 'uniikit avaimet');
assert.equal(statement.costs.at(-1).estimateNet, 4900);
assert.equal(statement.costs.at(-1).actualNet, 2263.68);

// Ilman majoitusta / huoltoautoa Kulut pysyy yhtenä rivinä (ei turhaa erittelyä).
const simple = compareQuoteCategories({
  quoteData: { ...quoteData, installationSupplies: [], installationVehicleAllowance: 0, travelKmRate: 0.5, workItems: [{ id: 'w', description: 'Matkat', hours: 0, pricePerHour: 0, materials: [{ id: 'k', name: 'Km-korvaus', quantity: 400, purchasePrice: 1, marginPercent: 25, sellPrice: 1.25 }] }] },
  partnerCalculation: calculateWorkReportBillable({ logs: [logs[0]], users, rates: partnerRates, ratesSource: 'company_default', tripKmRate: 0.5 }),
  logs: [logs[0]], partnerRates, tripKmRate: 0.5, billingSettings: { purchase_lines: [] },
});
const simpleExp = simple.rows.find((r) => r.key === 'expenses');
assert.equal(simpleExp.quoteQty, 400);
assert.equal(simpleExp.parts, undefined);

console.log('quote-km-accommodation: ok');
