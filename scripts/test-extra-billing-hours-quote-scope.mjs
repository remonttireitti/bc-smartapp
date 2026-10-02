/**
 * Regressio: kiinteä tarjous + 2 h hyväksyttyä lisälaskutusta (lisätyö) heikensi katetta.
 * - Lisälaskutettavat tunnit ovat osa päivän tunteja → kumppanilaskelmassa kerran (ei 4 h → 8 h).
 * - Ne eivät kuulu kiinteän tarjouksen vertailuun (Työt, Kulut yhteensä, tuomio).
 * - Asiakashinta tarjouksen tuntihinnasta, kun asiakashintaa ei ole (ei 0 €).
 * Luvut: tarjoushinta 1434, kulut 735,01 → kate 698,99 (+88,99 vs tarjouspyyntö 610);
 * lisätyö 2 h × 65 = 130, kumppani 2 h × 50 = 100 → lisien kate 30.
 */
import assert from "node:assert/strict";
import {
  calculateWorkReportBillable,
  mergePartnerExtraBillingFromDailyLogs,
  quoteScopePartnerCalculation,
  formatEuro,
} from "../src/lib/workReportBilling.ts";
import { computePartnerNetMargin, parseBillingQuoteSettings } from "../src/lib/workReportBillingQuote.ts";
import { mergeActualPurchaseFromWorkReportLogs } from "../src/lib/quoteRequestActualPurchaseSync.ts";
import { compareQuoteCategories } from "../src/lib/quoteCategoryComparison.ts";
import { buildQuoteOutcomeSummary } from "../src/lib/quoteOutcomeSummary.ts";
import {
  collectExtraBillingMarginImpactLines,
  quoteExtraWorkHourlyRate,
  resolveExtraWorkCustomerRates,
} from "../src/lib/dailyLogCustomerExtraBilling.ts";
import { applyQuoteCommissionToPartnerCalculation } from "../src/lib/workReportPartnerTotal.ts";

const quoteData = {"type":"huolto","lines":[],"region":"keski","vatRate":25.5,"brandMode":"auto","laborRate":65,"materials":[],"vilpZones":1,"workItems":[{"id":"405edf2d-213c-4807-84f9-e83bf80919be","hours":4,"materials":[],"description":"Työ","pricePerHour":65}],"heatedArea":70,"laborHours":2,"optionABad":"","optionBBad":"","optionCBad":"","roomHeight":2.5,"travelCost":0,"validUntil":"2026-11-01","vilpSeries":"","deviceBrand":"Inventor Leon 35","deviceModel":"","iilpPurpose":"cooling_heating","optionAGood":"","optionBGood":"","optionCGood":"","projectType":"korjaus","vilpCooling":true,"altDevice1Id":"","altDevice2Id":"","buildingType":"omakotitalo","buildingYear":1990,"travelKmRate":0.53,"householdSize":4,"optionalItems":[],"currentHeating":"sähkö","quoteTermsText":"","vilpTankLiters":0,"iilpPipeLengthM":0,"oilTankEmptying":false,"quoteTermsPrint":{"general":true,"warranty":true,"extraWork":true,"baseInstall":true,"commissioning":true,"operationMaintenance":true},"quoteVatProfile":"consumer","travelKmEnabled":false,"vilpBrandChoice":"","vilpIndoorModel":"","domesticHotWater":true,"faultDescription":"","oilBoilerRemoval":false,"paymentTermsText":"14 pv netto","selectedDeviceId":"","travelKmDistance":0,"vilpIndoorConfig":"ilman-varaa","vilpOutdoorModel":"","deliveryTermsText":"Työt sovitaan erikseen asiakkaan kanssa.","heatingSystemTemp":45,"heatingSystemType":"patteri_45","desiredTemperature":21,"deviceMarginPercent":25,"iilpCondensateNotes":"","iilpElectricalNotes":"","iilpIndoorPlacement":"","previousConsumption":0,"siteConfigConfirmed":false,"situationReportText":"","acceptedSiteDefaults":[],"deviceDeliveryFeeNet":null,"iilpLaborPricingMode":"urakka","iilpOutdoorPlacement":"","installationSupplies":[{"id":"74faf43d-c898-44dd-a542-8bd0ab83c38d","name":"Inventor Leon 35","rowKind":"device","quantity":1,"sellPrice":700,"marginPercent":100,"purchasePrice":350},{"id":"3661c20c-2099-421c-b577-591178438e1c","name":"Asennus tarvikkeet","rowKind":"supply","quantity":1,"sellPrice":450,"marginPercent":125,"purchasePrice":200},{"id":"e311f37a-b77a-4d09-8b9f-ecdaed834bad","name":"Huoltoauto","rowKind":"expense","quantity":1,"sellPrice":24,"marginPercent":0,"purchasePrice":24}],"situationReportTitle":"Tilanneraportti","deviceDiscountPercent":52.5,"deviceSaleOverrideNet":null,"iilpEnergySavingsText":"","excludedFromQuoteItems":[],"installationLaborHours":4,"overallDiscountPercent":0,"situationReportEnabled":false,"altDevice1MarginPercent":25,"altDevice2MarginPercent":25,"iilpDeviceSelectionNote":"","previousConsumptionUnit":"litraa","altDevice1DeliveryFeeNet":null,"altDevice2DeliveryFeeNet":null,"altDevice1DiscountPercent":0,"altDevice2DiscountPercent":0,"devicePurchaseOverrideNet":null,"iilpBaseInstallLaborGross":890,"installationVehicleAllowance":50,"iilpBaseInstallMaterialsGross":500,"installationLaborPurchaseRate":50,"installationVehicleHoursPerBlock":8};
const logs = [
  {
    "id": "log-extra",
    "work_report_id": "wr-1",
    "log_date": "2026-09-18",
    "entry_type": "regular",
    "hours_regular": 2,
    "hours_overtime": 0,
    "hours_on_call": 0,
    "hourly_rate_override": 50,
    "customer_extra_billing": {
      "hours": 2,
      "description": "2 kpl lämpöpumpun huolto",
      "hourly_rate": null,
      "hours_extra_billable": true,
      "hours_extra_billing_allowed": true
    },
    "customer_extra_beyond_quote": false,
    "commission_amount": 0,
    "fixed_price_amount": null,
    "work_done": "2 kpl lämpöpumpun huolto",
    "created_by": "user-1",
    "created_at": "2026-10-02T16:47:02.265061+00:00",
    "expense_lines": [],
    "trip_legs": [],
    "partner_purchase_lines": [],
    "refrigerant_lines": []
  },
  {
    "id": "log-install",
    "work_report_id": "wr-1",
    "log_date": "2026-10-02",
    "entry_type": "regular",
    "hours_regular": 4,
    "hours_overtime": 0,
    "hours_on_call": 0,
    "hourly_rate_override": null,
    "customer_extra_billing": {
      "supply_line_flags": [
        {
          "extra_billable": false,
          "extra_billing_allowed": false,
          "customer_margin_percent": 80
        },
        {
          "extra_billable": false,
          "extra_billing_allowed": false,
          "customer_margin_percent": 80
        }
      ]
    },
    "customer_extra_beyond_quote": false,
    "commission_amount": 0,
    "fixed_price_amount": null,
    "work_done": "Asennus",
    "created_by": "user-1",
    "created_at": "2026-10-02T16:38:01.752988+00:00",
    "expense_lines": [
      {
        "id": "exp-0",
        "qty": 1,
        "sort_order": 0,
        "unit_price": 150,
        "description": "Asennus tarvikkeet",
        "daily_log_id": "log-install",
        "expense_type": "material",
        "extra_billable": false,
        "bill_to_partner": true,
        "bill_to_customer": true,
        "customer_unit_price": 166.67,
        "warehouse_company_id": null,
        "extra_billing_allowed": false,
        "customer_margin_percent": 10,
        "warehouse_cost_deducted": false
      },
      {
        "id": "exp-1",
        "qty": 1,
        "sort_order": 1,
        "unit_price": 350,
        "description": "Inventor Leon 35",
        "daily_log_id": "log-install",
        "expense_type": "device",
        "extra_billable": false,
        "bill_to_partner": false,
        "bill_to_customer": false,
        "customer_unit_price": null,
        "warehouse_company_id": null,
        "extra_billing_allowed": false,
        "customer_margin_percent": 80,
        "warehouse_cost_deducted": false
      },
      {
        "id": "exp-2",
        "qty": 1.6,
        "sort_order": 2,
        "unit_price": 21.88,
        "description": "Ajomatkat (1.6 km, minimilaskutus huoltoautosta)",
        "daily_log_id": "log-install",
        "expense_type": "km",
        "extra_billable": false,
        "bill_to_partner": true,
        "bill_to_customer": true,
        "customer_unit_price": 21.88,
        "warehouse_company_id": null,
        "extra_billing_allowed": false,
        "customer_margin_percent": 10,
        "warehouse_cost_deducted": false
      }
    ],
    "trip_legs": [
      {
        "id": "leg-0",
        "daily_log_id": "log-install",
        "sort_order": 0,
        "distance_km": 0.8,
        "bill_to_customer": true,
        "from_label": "A",
        "to_label": "B"
      },
      {
        "id": "leg-1",
        "daily_log_id": "log-install",
        "sort_order": 1,
        "distance_km": 0.8,
        "bill_to_customer": true,
        "from_label": "A",
        "to_label": "B"
      }
    ],
    "partner_purchase_lines": [],
    "refrigerant_lines": []
  }
];
const billingQuote = {
  "notes": null,
  "quote_title": "Testitarjous",
  "customer_mode": "quote_fixed",
  "purchase_lines": [
    {
      "id": "group:installation-internal",
      "unit": "kpl",
      "label": "Asennustyö (sisäinen hankinta)",
      "source": "group",
      "quantity": 1,
      "quote_purchase_net": 250,
      "actual_purchase_net": 250
    },
    {
      "id": "device:override",
      "unit": "kpl",
      "label": "Laite / urakka",
      "source": "device",
      "quantity": 1,
      "quote_purchase_net": 0,
      "actual_purchase_net": 0
    }
  ],
  "quote_sale_net": 1434,
  "quote_vat_rate": 25.5,
  "quote_request_id": "q-1",
  "quote_purchase_net": 250,
  "actual_purchase_net": 250,
  "customer_invoice_total": 1799.67,
  "partner_commission_amount": null,
  "partner_commission_percent": 0,
  "quote_seeded_rows": {
    "lines": [
      {
        "id": "material:3661c20c-2099-421c-b577-591178438e1c",
        "qty": 1,
        "description": "Asennus tarvikkeet",
        "expense_type": "material"
      },
      {
        "id": "material:e311f37a-b77a-4d09-8b9f-ecdaed834bad",
        "qty": 1,
        "description": "Huoltoauto",
        "expense_type": "other"
      }
    ],
    "quote_request_id": "q-1"
  }
};

const users = [{ id: "user-1", display_name: "Asentaja", bill_hours_enabled: true, bill_expenses_enabled: true }];
const partnerRates = { hourly_regular: 50, hourly_overtime: 82.5, hourly_on_call: 110 };
const round = (v) => Math.round(v * 100) / 100;

const partner = mergePartnerExtraBillingFromDailyLogs(
  calculateWorkReportBillable({
    logs,
    users,
    rates: partnerRates,
    ratesSource: "partnership",
    billToCompanyId: "owner",
    billToCompanyName: "Owner Oy",
    tripKmRate: 0.59,
  }),
  { logs, rates: partnerRates, users },
);
const partnerLines = partner.byUser.flatMap((user) => user.lines);
assert.equal(partnerLines.some((line) => line.logId.endsWith(":extra-hours")), false, "ei tuplattua lisätyöriviä");
assert.equal(round(partner.byUser.reduce((sum, user) => sum + user.hoursQty, 0)), 6, "kumppanin tunnit kerran: 4 + 2");
assert.equal(partner.grandTotal, 485.01, "kumppanilasku 300 + 150 + 35,01");

// Vanha tallennettu laskelma (ennen korjausta) sisälsi tuplarivin — vertailu ei saa laskea sitä.
const storedOld = structuredClone(partner);
storedOld.byUser[0].lines.push({
  logId: "log-extra:extra-hours",
  logDate: "2026-09-18",
  kind: "hours_regular",
  description: "Lisätyö: 2 kpl lämpöpumpun huolto",
  qty: 2,
  unitPrice: 50,
  total: 100,
  included: true,
});
storedOld.byUser[0].hoursQty += 2;
storedOld.byUser[0].hoursTotal += 100;
storedOld.byUser[0].subtotal += 100;
storedOld.grandTotal = 585.01;

const scope = quoteScopePartnerCalculation(storedOld, logs);
assert.equal(round(scope.byUser.reduce((sum, user) => sum + user.hoursQty, 0)), 4, "tarjouksen tunnit 4 h");
assert.equal(scope.grandTotal, 385.01);

assert.equal(quoteExtraWorkHourlyRate(quoteData), 65);
assert.deepEqual(resolveExtraWorkCustomerRates(undefined, quoteData), { hourly_regular: 65 });
assert.deepEqual(resolveExtraWorkCustomerRates({ hourly_regular: 70 }, quoteData), { hourly_regular: 70 });

for (const [name, calc] of [["uusi laskelma", partner], ["vanha tallennettu laskelma", storedOld]]) {
  const settings = mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(billingQuote), logs, quoteData);
  const margin = computePartnerNetMargin(settings, calc.grandTotal, {
    logs,
    partnerRates: calc.ratesUsed,
    customerRates: undefined,
    partnerCalculation: calc,
    quoteData,
  });
  const comparison = compareQuoteCategories({
    quoteData,
    partnerCalculation: calc,
    logs,
    partnerRates: calc.ratesUsed,
    tripKmRate: 0.59,
    billingSettings: settings,
  });
  const summary = buildQuoteOutcomeSummary({ partnerMargin: margin, comparison, formatEuro });
  const labor = summary.rows.find((row) => row.key === "labor");
  assert.equal(labor.actualNet, 200, `${name}: Työt toteutunut`);
  assert.equal(labor.qtyLabel, "4 h / 4 h", `${name}: tunnit`);
  assert.equal(summary.costs.estimateNet, 824, `${name}: kulut arvio`);
  assert.equal(summary.costs.actualNet, 735.01, `${name}: Kulut yhteensä`);
  assert.equal(margin.quoteGrossMarginNet, 698.99, `${name}: tarjouksen kate`);
  assert.equal(summary.verdict.label, "Meni tarjouspyyntöä paremmin +88,99 €", `${name}: tuomio`);
  // Hyväksytty lisätyö: tarjoushinta + lisät − kulut kerran = 1434 + 130 − 300 − 35,01 − 350 − 150
  assert.equal(summary.customerExtrasNet, 130, `${name}: lisät asiakkaalta`);
  assert.equal(summary.saleTotalNet, 1564);
  assert.equal(summary.extrasMarginNet, 30);
  assert.equal(summary.marginSaleNet, 1464);
  assert.equal(summary.grossMargin.actualNet, 728.99, `${name}: kate ennen provisiota`);
  assert.equal(summary.grossMargin.actualNet, round(summary.marginSaleNet - summary.costs.actualNet));
  assert.equal(summary.netMarginNet, 728.99, `${name}: puhdas kate (provisio 0 %)`);

  const extras = collectExtraBillingMarginImpactLines(logs, calc.ratesUsed, resolveExtraWorkCustomerRates(undefined, quoteData));
  assert.equal(extras.length, 1);
  assert.equal(extras[0].status, "approved");
  assert.equal(extras[0].customerNet, 130, `${name}: Asiakas`);
  assert.equal(extras[0].partnerNet, 100, `${name}: Kumppani`);
  assert.equal(extras[0].marginIfApprovedNet, 30, `${name}: Kate`);
}

// Odottava lisätyö (ei lupaa) ei heikennä tarjouksen katetta eikä lisää myyntiä.
const pendingLogs = logs.map((log) =>
  log.id === "log-extra"
    ? { ...log, customer_extra_billing: { ...log.customer_extra_billing, hours_extra_billing_allowed: false } }
    : log,
);
const pendingSettings = mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(billingQuote), pendingLogs, quoteData);
const pendingMargin = computePartnerNetMargin(pendingSettings, partner.grandTotal, {
  logs: pendingLogs,
  partnerRates: partner.ratesUsed,
  partnerCalculation: partner,
  quoteData,
});
assert.equal(pendingMargin.grossMarginNet, 698.99);
assert.equal(pendingMargin.customerExtrasNet, 0);
const pendingLine = collectExtraBillingMarginImpactLines(pendingLogs, partner.ratesUsed, resolveExtraWorkCustomerRates(undefined, quoteData))[0];
assert.equal(pendingLine.status, "pending");
assert.equal(pendingLine.currentMarginImpactNet, 0);
assert.equal(pendingLine.marginIfApprovedNet, 30);

// Kumppanilasku ja provisio (0 %): ei muutu lisälaskutuksesta, tunnit kerran.
const withCommission = applyQuoteCommissionToPartnerCalculation({ billingQuote, logs, calculation: partner, quoteData });
assert.equal(withCommission.calculation.grandTotal, 485.01);

console.log("test-extra-billing-hours-quote-scope: ok");
