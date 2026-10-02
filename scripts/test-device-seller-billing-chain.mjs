/**
 * Regressio: laitemyyjä-laskutusketju (tilaaja myy vain laitteen, urakoitsija + kevytyrittäjä).
 * Kaikki alv 0 %:
 * - Asiakas maksaa tilaajalle 1434 + lisätyö 2 h × 65 = 1564.
 * - Tilaajalle jää laitekate 700 − 350 + lisätyö 130 = 480 (kevytyrittäjä ei laskuta lisätunteja).
 * - Urakoitsija laskuttaa tilaajalta 1434 − 700 = 734.
 * - Kevytyrittäjä laskuttaa urakoitsijalta 200 + 35,01 = 235,01.
 * - Urakoitsijalle jää 734 − 235,01 − tarvikkeet 150 = 348,99.
 * Laskuluonnokset: raportin kumppanilasku 235,01 (→ urakoitsija) + urakoitsijan lasku 734 (→ tilaaja).
 */
import assert from "node:assert/strict";
import {
  calculateWorkReportBillable,
  mergePartnerExtraBillingFromDailyLogs,
  formatEuro,
} from "../src/lib/workReportBilling.ts";
import { computePartnerNetMargin, parseBillingQuoteSettings } from "../src/lib/workReportBillingQuote.ts";
import { mergeActualPurchaseFromWorkReportLogs } from "../src/lib/quoteRequestActualPurchaseSync.ts";
import { compareQuoteCategories } from "../src/lib/quoteCategoryComparison.ts";
import { buildQuoteOutcomeSummary, renderQuoteOutcomeSummaryHtml } from "../src/lib/quoteOutcomeSummary.ts";
import {
  buildCustomerExtraBillingFromLogForm,
  collectExtraBillingMarginImpactLines,
  dailyLogExtraBillingToForm,
  parseDailyLogCustomerExtraBilling,
  resolveExtraWorkCustomerRates,
} from "../src/lib/dailyLogCustomerExtraBilling.ts";
import { applyQuoteCommissionToPartnerCalculation } from "../src/lib/workReportPartnerTotal.ts";
import { generateWorkReportPrintHtml } from "../src/lib/workReportPrintHtml.ts";
import {
  applyContractorChainToBillingRow,
  billingPartnerState,
  billingRowAmount,
  billToPartnerId,
  billToPartnerName,
} from "../src/lib/workReportBillingCopy.ts";
import {
  deviceSellerLabels,
  quoteDeviceSaleNet,
  resolveDeviceSellerSaleNet,
} from "../src/lib/workReportDeviceSeller.ts";

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
      "hours_extra_billing_allowed": true,
      "hours_partner_billed": false
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
  "device_sale_net": 700,
  "contractor_company_id": "contractor-1",
  "contractor_company_name": "Lämpökatsastus Oy",
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
const names = {
  ownerName: "Termatek Oy",
  contractorName: "Lämpökatsastus Oy",
  installerName: "Kevytyrittäjä Enn Kotselainen",
};

function build(currentLogs, quote, deviceSeller, storedCalculation) {
  const partner = storedCalculation ?? mergePartnerExtraBillingFromDailyLogs(
    calculateWorkReportBillable({
      logs: currentLogs,
      users,
      rates: partnerRates,
      ratesSource: "partnership",
      billToCompanyId: "owner",
      billToCompanyName: "Termatek Oy",
      tripKmRate: 0.59,
    }),
    { logs: currentLogs, rates: partnerRates, users },
  );
  const settings = mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(quote), currentLogs, quoteData);
  const margin = computePartnerNetMargin(settings, partner.grandTotal, {
    logs: currentLogs,
    partnerRates: partner.ratesUsed,
    partnerCalculation: partner,
    quoteData,
  });
  const comparison = compareQuoteCategories({
    quoteData,
    partnerCalculation: partner,
    logs: currentLogs,
    partnerRates: partner.ratesUsed,
    tripKmRate: 0.59,
    billingSettings: settings,
  });
  const deviceSaleNet = resolveDeviceSellerSaleNet(settings);
  const summary = buildQuoteOutcomeSummary({
    partnerMargin: margin,
    comparison,
    formatEuro,
    deviceSeller: deviceSeller && deviceSaleNet != null
      ? {
          deviceSaleNet,
          ...names,
          contractorName: settings.contractor_company_name,
          installerBillsSupplies: settings.installer_bills_supplies === true,
        }
      : undefined,
  });
  return { partner, settings, margin, summary };
}

// Laitteen myyntihinta tarjouspyynnöstä (oletus kenttään).
assert.equal(quoteDeviceSaleNet(quoteData), 700);
assert.equal(quoteDeviceSaleNet(null), null);

// Lisätunnit: "kumppani ei laskuta" säilyy lomakkeen läpi.
const extraBilling = logs[0].customer_extra_billing;
assert.equal(parseDailyLogCustomerExtraBilling(extraBilling).hours_partner_billed, false);
const form = { ...dailyLogExtraBillingToForm(extraBilling), work_done: "Huolto", entry_type: "regular", hours_regular: "2", hours_overtime: "0", hours_on_call: "0", customer_hourly_rate_override: "" };
assert.equal(form.hours_extra_partner_billed, false);
assert.equal(buildCustomerExtraBillingFromLogForm(form).hours_partner_billed, false);
assert.equal(dailyLogExtraBillingToForm({ hours: 2, hours_extra_billable: true }).hours_extra_partner_billed, true);

const { partner, settings, margin, summary } = build(logs, billingQuote, true);

// Kevytyrittäjän laskelma: lisätunnit eivät ole laskulla (4 h × 50 + tarvikkeet 150 + km 35,01).
assert.equal(round(partner.byUser.reduce((sum, user) => sum + user.hoursQty, 0)), 4, "vain asennuksen 4 h");
assert.equal(partner.grandTotal, 385.01);

// Lisälaskutus-taulukko: Asiakas 130, Kumppani 0, Kate 130.
const extras = collectExtraBillingMarginImpactLines(logs, partner.ratesUsed, resolveExtraWorkCustomerRates(undefined, quoteData));
assert.equal(extras.length, 1);
assert.equal(extras[0].customerNet, 130);
assert.equal(extras[0].partnerNet, 0);
assert.equal(extras[0].marginIfApprovedNet, 130);
assert.equal(margin.customerExtrasNet, 130);
assert.equal(margin.extrasMarginNet, 130);

// Tarjous ja kate: kulut kuten ennen.
assert.equal(summary.costs.estimateNet, 824);
assert.equal(summary.costs.actualNet, 735.01);
assert.equal(summary.rows.find((row) => row.key === "labor").actualNet, 200);

// Laskutuslaskelma osapuolittain.
const party = Object.fromEntries(summary.parties.map((row) => [row.key, row]));
assert.deepEqual(summary.parties.map((row) => row.key), [
  "customer",
  "ownerKeeps",
  "contractorInvoice",
  "installerInvoice",
  "contractorKeeps",
]);
assert.equal(party.customer.actualNet, 1564, "asiakas maksaa Termatekille");
assert.equal(party.ownerKeeps.actualNet, 480, "Termatekille jää laitekate 350 + lisätyö 130");
assert.equal(party.contractorInvoice.actualNet, 734, "Lämpökatsastus laskuttaa Termatekilta");
assert.equal(party.installerInvoice.actualNet, 235.01, "kevytyrittäjä laskuttaa Lämpökatsastukselta");
assert.equal(party.contractorKeeps.actualNet, 348.99, "Lämpökatsastukselle jää");
assert.equal(party.customer.estimateNet, 1434);
assert.equal(party.ownerKeeps.estimateNet, 350);
assert.equal(party.contractorInvoice.estimateNet, 734);
assert.equal(party.installerInvoice.estimateNet, 274);
assert.equal(party.contractorKeeps.estimateNet, 260);
assert.equal(party.contractorKeeps.varianceNet, 88.99);
assert.equal(summary.verdict.label, "Meni tarjouspyyntöä paremmin +88,99 €");
assert.equal(summary.netMarginNet, 348.99, "kate = Lämpökatsastukselle jäävä");
assert.equal(summary.commissionNet, 0, "ei provisiota laitemyyjä-ketjussa");
// Tarkistus: osat summautuvat asiakkaan maksuun.
const deviceCost = summary.rows.filter((row) => row.key === "device").reduce((sum, row) => sum + row.actualNet, 0);
const supplies = summary.rows.filter((row) => row.key === "supplies").reduce((sum, row) => sum + row.actualNet, 0);
assert.equal(deviceCost, 350);
assert.equal(supplies, 150);
assert.equal(
  round(party.ownerKeeps.actualNet + party.contractorKeeps.actualNet + party.installerInvoice.actualNet + deviceCost + supplies),
  1564,
);
assert.equal(round(party.contractorInvoice.actualNet - party.installerInvoice.actualNet - supplies), 348.99);

const labels = deviceSellerLabels(names);
assert.equal(labels.customer, "Asiakas maksaa Termatek Oy:lle");
assert.equal(labels.ownerKeeps, "Termatek Oy:lle jää");
assert.equal(labels.contractorInvoice, "Lämpökatsastus Oy laskuttaa Termatek Oy:ltä");
assert.equal(labels.installerInvoice, "Kevytyrittäjä Enn Kotselainen laskuttaa Lämpökatsastus Oy:ltä");
assert.equal(labels.contractorKeeps, "Lämpökatsastus Oy:lle jää");
assert.equal(party.contractorKeeps.label, labels.contractorKeeps);

// Sisäinen tuloste: osapuolirivit, ei provisiota eikä kahdesti samaa asiakashintaa.
const html = renderQuoteOutcomeSummaryHtml(summary, { escapeHtml: (s) => s, formatEuro });
assert.match(html, /Laskutuslaskelma/);
assert.match(html, /Lämpökatsastus Oy:lle jää/);
assert.doesNotMatch(html, /Provisio/);
assert.doesNotMatch(html, /Puhdas kate/);
assert.equal((html.match(/1564,00 €/g) ?? []).length, 1);

// Kaksi laskuluonnosta:
// 1) raportin kumppanilasku = kevytyrittäjä → Lämpökatsastus 235,01 (työt 200 + kulut 35,01;
//    tarvikkeet 150 ovat urakoitsijan omia, eivät asentajan laskulla),
// 2) urakoitsijan lasku Lämpökatsastus → Termatek 734 (tarjous − laite).
const invoice = applyQuoteCommissionToPartnerCalculation({ billingQuote, logs, calculation: partner, quoteData });
assert.equal(invoice.calculation.grandTotal, 235.01, "asentajan lasku urakoitsijalle");
assert.equal(invoice.calculation.billToCompanyId, "contractor-1");
assert.equal(invoice.calculation.billToCompanyName, "Lämpökatsastus Oy");
const invoiceLines = invoice.calculation.byUser.flatMap((user) => user.lines).filter((line) => line.included);
assert.deepEqual(
  invoiceLines.map((line) => [line.description.slice(0, 8), line.total]),
  [["Tunnit", 200], ["Ajomatka", 35.01]],
);
assert.equal(invoiceLines.some((line) => line.kind === "commission"), false, "ei provisio-/tasausriviä");
assert.deepEqual(invoice.calculation.contractorCostLines.map((line) => [line.description, line.total]), [["Asennus tarvikkeet", 150]]);
assert.deepEqual(invoice.calculation.contractorInvoice, {
  fromCompanyId: "contractor-1",
  fromCompanyName: "Lämpökatsastus Oy",
  toCompanyId: "owner",
  toCompanyName: "Termatek Oy",
  amount: 734,
  description: "Asennusurakka (tarjous − laite)",
});
// Tallennetusta (asentajan) laskelmasta laskettuna kate ja laskelma eivät muutu.
const stored = build(logs, billingQuote, true, invoice.calculation);
assert.equal(stored.summary.costs.actualNet, 735.01);
assert.deepEqual(stored.summary.parties.map((row) => row.actualNet), [1564, 480, 734, 235.01, 348.99]);
assert.equal(stored.summary.rows.find((row) => row.key === "supplies").actualNet, 150);
// Uudelleenlaskenta tallennetusta laskelmasta: sama tulos (idempotentti).
const again = applyQuoteCommissionToPartnerCalculation({ billingQuote, logs, calculation: invoice.calculation, quoteData });
assert.equal(again.calculation.grandTotal, 235.01);
assert.equal(again.calculation.contractorInvoice.amount, 734);
assert.equal(again.calculation.contractorInvoice.toCompanyName, "Termatek Oy");
assert.equal(again.calculation.contractorCostLines.length, 1);

// Laskutus-lista: kevytyrittäjä näkee lähtevän laskun Lämpökatsastukselle 235,01;
// Termatek näkee saapuvan laskun Lämpökatsastukselta 734 (oma tila).
const listRow = {
  id: "wr-1",
  title: "Testi",
  status: "in_progress",
  owner_company_id: "owner",
  created_by_company_id: "installer",
  delegate_company_id: null,
  owner_company: { name: "Termatek Oy" },
  creator_company: { name: "Kevytyrittäjä Enn Kotselainen" },
  delegate_company: null,
  customers: null,
  billing: { partner_invoice_status: "none", partner_invoice_amount: 235.01, partner_billed_amount: null, partner_billed_at: null, customer_invoice_status: "none", customer_invoice_amount: null, customer_billed_at: null },
  billable: { partner_total: 235.01, calculation: invoice.calculation, billing_quote: billingQuote },
};
assert.equal(applyContractorChainToBillingRow(listRow, "installer"), listRow);
assert.equal(billToPartnerName(listRow, "installer"), "Lämpökatsastus Oy");
assert.equal(billToPartnerId(listRow, "installer"), "contractor-1");
assert.equal(billingRowAmount(listRow, "partner"), 235.01);
const ownerRow = applyContractorChainToBillingRow(listRow, "owner");
assert.equal(ownerRow.contractorInvoiceLeg, true);
assert.equal(billingRowAmount(ownerRow, "partner"), 734);
assert.equal(billToPartnerName(ownerRow, "owner"), "Lämpökatsastus Oy");
assert.equal(billToPartnerId(ownerRow, "owner"), "contractor-1");
assert.equal(billingPartnerState(ownerRow), "open");
const ownerPaid = applyContractorChainToBillingRow(
  { ...listRow, billable: { ...listRow.billable, billing_quote: { ...billingQuote, contractor_invoice: { status: "paid", billed_amount: 734, billed_at: "2026-10-02T18:00:00Z" } } } },
  "owner",
);
assert.equal(billingPartnerState(ownerPaid), "billed");
assert.equal(billingPartnerState(listRow), "open", "asentajan lasku pysyy avoimena");
// Asiakaslaskutus ei muutu.
assert.equal(ownerRow.billing.customer_invoice_status, "none");
assert.equal(parseBillingQuoteSettings({ ...billingQuote, contractor_invoice: { status: "paid", billed_amount: 734 } }).contractor_invoice.billed_amount, 734);

// Asentaja laskuttaa tarvikkeet (asetus): tarvikkeet asentajan laskulla, urakoitsijalle jää sama.
const suppliesQuote = { ...billingQuote, installer_bills_supplies: true };
const suppliesChain = build(logs, suppliesQuote, true);
const suppliesParty = Object.fromEntries(suppliesChain.summary.parties.map((row) => [row.key, row.actualNet]));
assert.equal(suppliesParty.installerInvoice, 385.01);
assert.equal(suppliesParty.contractorKeeps, 348.99);
assert.equal(applyQuoteCommissionToPartnerCalculation({ billingQuote: suppliesQuote, logs, calculation: partner, quoteData }).calculation.grandTotal, 385.01);

// Ilman urakoitsijaa (raportin laatija on urakoitsija): kumppanilasku tasataan 734:ään.
const noContractorQuote = { ...billingQuote, contractor_company_id: null, contractor_company_name: null };
const own = applyQuoteCommissionToPartnerCalculation({ billingQuote: noContractorQuote, logs, calculation: partner, quoteData });
assert.equal(own.calculation.grandTotal, 734);
assert.equal(own.calculation.contractorInvoice ?? null, null);
const balance = own.calculation.byUser.flatMap((user) => user.lines).find((line) => line.logId === "auto-partner-commission");
assert.equal(balance.total, 348.99);
assert.match(balance.description, /^Urakkaosuus/);

// Esikatselu (laitehinta tarjouspyynnöstä, ei tallennettu) merkitään esikatseluksi.
const previewSummary = buildQuoteOutcomeSummary({
  partnerMargin: margin,
  comparison: null,
  formatEuro,
  deviceSeller: { deviceSaleNet: 700, ...names, contractorName: null, preview: true },
});
assert.equal(previewSummary.partiesPreview, true);
assert.equal(summary.partiesPreview, false);
assert.equal(party.ownerKeeps.note, "laitekate 350,00 € + lisätyö 130,00 €");

// Tulosteet: sisäinen näyttää laskutuslaskelman ja asentajan laskun urakoitsijalle;
// asiakastuloste ei näytä ketjua, kumppanisummia eikä provisiota.
const printReport = {
  id: "wr-1",
  status: "in_progress",
  title: "Testi",
  description: null,
  heading: null,
  location_text: null,
  orderer_name: null,
  completed_at: null,
  scheduled_start: null,
  owner_company_id: "owner",
  created_by_company_id: "installer",
  delegate_company_id: null,
  owner_company: { name: "Termatek Oy" },
  created_by_company: { name: "Kevytyrittäjä Enn Kotselainen" },
  branding_company: null,
  delegate_company: null,
  customers: { name: "Asiakas" },
  assignee: null,
  created_by_profile: null,
  equipment: null,
};
const printInput = {
  report: printReport,
  logs,
  calculation: invoice.calculation,
  // Sama pohja kuin workReportPrintAction (hankinnat päiväkirjasta).
  billingQuote: mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(billingQuote), logs, quoteData),
  quoteData,
  tripKmRate: 0.59,
  meta: { companyName: "Kevytyrittäjä Enn Kotselainen" },
};
const internalHtml = generateWorkReportPrintHtml({ ...printInput, showPartnerPrices: true, printMode: "internal" });
assert.match(internalHtml, /Laskutuslaskelma/);
assert.match(internalHtml, /Laskutettava: <strong>Lämpökatsastus Oy/);
assert.match(internalHtml, /Lämpökatsastus Oy:lle jää/);
assert.match(internalHtml, /348,99 €/);
assert.match(internalHtml, /laitekate 350,00 € \+ lisätyö 130,00 €/);
assert.doesNotMatch(internalHtml, /Lisälaskutuksen kate-erittely/, "lisätyö näkyy jo tilaajan rivillä");
const customerHtml = generateWorkReportPrintHtml({ ...printInput, showPartnerPrices: false, printMode: "customer" });
for (const hidden of [/Laskutuslaskelma/, /Lämpökatsastus/, /Provisio/, /734,00/, /235,01/, /348,99/, /Urakkaosuus/]) {
  assert.doesNotMatch(customerHtml, hidden);
}

// Ilman laitteen myyntihintaa näkymä ja lasku ennallaan (ei osapuolirivejä, provisio 0 % → kulut).
const plainQuote = { ...billingQuote, device_sale_net: null, contractor_company_id: null, contractor_company_name: null };
const plain = build(logs, plainQuote, true);
assert.equal(plain.summary.parties, null);
assert.equal(plain.summary.grossMargin.actualNet, 828.99, "lisätyö jää kokonaan katteeseen (kumppani ei laskuta)");
assert.equal(applyQuoteCommissionToPartnerCalculation({ billingQuote: plainQuote, logs, calculation: plain.partner, quoteData }).calculation.grandTotal, 385.01);

// Kumppani laskuttaa lisätunnit (oletus): lisätyön kumppanikulu urakoitsijan laskulle ja kevytyrittäjälle.
const billedLogs = logs.map((log) =>
  log.id === "log-extra"
    ? { ...log, customer_extra_billing: { ...log.customer_extra_billing, hours_partner_billed: undefined } }
    : log,
);
const billed = build(billedLogs, billingQuote, true);
assert.equal(billed.partner.grandTotal, 485.01);
const billedParty = Object.fromEntries(billed.summary.parties.map((row) => [row.key, row.actualNet]));
assert.equal(billedParty.customer, 1564);
assert.equal(billedParty.ownerKeeps, 380);
assert.equal(billedParty.contractorInvoice, 834);
assert.equal(billedParty.installerInvoice, 335.01);
assert.equal(billedParty.contractorKeeps, 348.99);
assert.equal(
  applyQuoteCommissionToPartnerCalculation({ billingQuote, logs: billedLogs, calculation: billed.partner, quoteData }).calculation.contractorInvoice.amount,
  834,
);
assert.equal(
  applyQuoteCommissionToPartnerCalculation({ billingQuote, logs: billedLogs, calculation: billed.partner, quoteData }).calculation.grandTotal,
  335.01,
);

// Ilman urakoitsijaa raportin laatija on urakoitsija (ei asentajan laskuriviä).
const noContractor = deviceSellerLabels({ ...names, contractorName: null });
assert.equal(noContractor.installerInvoice, "Työt ja kulut");
assert.equal(noContractor.contractorInvoice, "Kevytyrittäjä Enn Kotselainen laskuttaa Termatek Oy:ltä");

console.log("test-device-seller-billing-chain: ok");
