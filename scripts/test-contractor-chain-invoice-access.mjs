/**
 * Regressio: laitemyyjä-ketjun urakoitsijan lähtevä lasku (RPC contractor_chain_invoice_reports)
 * ja tilaajan saapuva lasku raporttisivulla (urakoitsijan 734 €, ei asentajan rivejä).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contractorChainInvoiceRowToBillingRow,
  loadContractorChainInvoiceRows,
  mergeContractorChainInvoiceRows,
  setContractorChainInvoiceBilled,
} from "../src/lib/contractorChainInvoices.ts";
import {
  applyContractorChainToBillingRow,
  billingPartnerState,
  billingRowAmount,
  billToPartnerId,
  billToPartnerName,
  canViewerRecalcPartnerBill,
  contractorInvoiceCalculation,
  isContractorChainLegRow,
  isOutgoingPartnerBill,
} from "../src/lib/workReportBillingCopy.ts";

const CONTRACTOR = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const INSTALLER = "11111111-1111-4111-8111-111111111111";
const REPORT = "786e17fe-22d9-4718-ae55-dce2b1fdb4ac";

const rpcRow = {
  work_report_id: REPORT,
  title: "Inventor Leon asennus",
  status: "in_progress",
  completed_at: null,
  scheduled_start: "2026-09-30T06:00:00+00:00",
  created_at: "2026-09-29T10:00:00+00:00",
  owner_company_id: OWNER,
  owner_company_name: "Termatek Oy",
  amount: "734.00",
  invoice_status: "none",
  billed_amount: null,
  billed_at: null,
};

// --- RPC-rivi → Laskutus-listan rivi (urakoitsijan näkymä) ---
const row = contractorChainInvoiceRowToBillingRow(rpcRow, CONTRACTOR, "Lämpökatsastus Oy");
assert.ok(row);
assert.equal(row.contractorOutgoingLeg, true);
assert.equal(row.created_by_company_id, CONTRACTOR);
assert.equal(row.owner_company_id, OWNER);
assert.equal(row.customers, null, "asiakastietoja ei näytetä urakoitsijalle");
assert.equal(billingRowAmount(row, "partner"), 734);
assert.equal(row.billable.calculation.grandTotal, 734);
assert.equal(row.billable.calculation.byUser.length, 1);
assert.equal(row.billable.calculation.byUser[0].lines.length, 1);
assert.equal(row.billable.calculation.byUser[0].lines[0].kind, "fixed_price");
assert.equal(row.billable.calculation.byUser[0].lines[0].description, "Asennusurakka (tarjous − laite)");
assert.equal(row.billable.calculation.byUser[0].lines[0].logDate, "2026-09-30");
assert.equal(isOutgoingPartnerBill(row, CONTRACTOR), true, "lähtevä lasku urakoitsijalta");
assert.equal(billToPartnerId(row, CONTRACTOR), OWNER);
assert.equal(billToPartnerName(row, CONTRACTOR), "Termatek Oy");
assert.equal(billingPartnerState(row), "open");
assert.equal(canViewerRecalcPartnerBill(row, CONTRACTOR), false, "ei laskelman päivitystä urakoitsijalle");
assert.equal(isContractorChainLegRow(row), true, "kopioi-/tulostetoiminnot piilossa");

const paidRow = contractorChainInvoiceRowToBillingRow(
  { ...rpcRow, invoice_status: "paid", billed_amount: 734, billed_at: "2026-10-02T20:00:00+00:00" },
  CONTRACTOR,
);
assert.equal(paidRow.billing.partner_invoice_status, "paid");
assert.equal(paidRow.billing.partner_billed_amount, 734);
assert.equal(billingPartnerState(paidRow), "billed");

assert.equal(contractorChainInvoiceRowToBillingRow({ ...rpcRow, amount: null }, CONTRACTOR), null);

// --- RPC-kutsu: funktio puuttuu (ennen SQL:ää) → tyhjä lista, ei virhettä ---
const missingFn = {
  rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
};
assert.deepEqual(await loadContractorChainInvoiceRows(missingFn, CONTRACTOR), []);
const throwing = { rpc: async () => { throw new Error("network"); } };
assert.deepEqual(await loadContractorChainInvoiceRows(throwing, CONTRACTOR), []);
let rpcName = null;
const working = {
  rpc: async (name, args) => {
    rpcName = name;
    assert.equal(args, undefined);
    return { data: [rpcRow, { ...rpcRow, work_report_id: "x", amount: "abc" }], error: null };
  },
};
const loaded = await loadContractorChainInvoiceRows(working, CONTRACTOR);
assert.equal(rpcName, "contractor_chain_invoice_reports");
assert.equal(loaded.length, 1);

// --- Yhdistäminen: ei kahdennusta, jos raportti on jo listassa ---
const existing = [{ ...row, contractorOutgoingLeg: undefined }];
assert.equal(mergeContractorChainInvoiceRows(existing, loaded).length, 1);
assert.equal(mergeContractorChainInvoiceRows([], loaded).length, 1);

// --- Merkintä RPC:llä ---
let setCall = null;
await setContractorChainInvoiceBilled(
  { rpc: async (name, args) => { setCall = { name, args }; return { data: null, error: null }; } },
  REPORT,
  true,
);
assert.deepEqual(setCall, {
  name: "set_contractor_chain_invoice_billed",
  args: { p_work_report_id: REPORT, p_billed: true },
});
await assert.rejects(
  setContractorChainInvoiceBilled({ rpc: async () => ({ data: null, error: { message: "Ei oikeutta" } }) }, REPORT, false),
  /Ei oikeutta/,
);

// --- Tilaajan näkymä: saapuva lasku on urakoitsijan 734 €, ei asentajan rivejä ---
const installerCalc = {
  version: 6,
  ratesUsed: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: "partnership",
  billToCompanyId: CONTRACTOR,
  billToCompanyName: "Lämpökatsastus Oy",
  byUser: [
    {
      userId: "enn",
      userName: "Enn",
      billHoursEnabled: true,
      billExpensesEnabled: true,
      effectiveBillHoursEnabled: true,
      effectiveBillExpensesEnabled: true,
      hoursQty: 4,
      hoursTotal: 200,
      expensesTotal: 35.01,
      fixedTotal: 0,
      commissionTotal: 0,
      subtotal: 235.01,
      excludedSubtotal: 0,
      lines: [
        { logId: "l1", logDate: "2026-09-30", kind: "hours", description: "Työ", qty: 4, unitPrice: 50, total: 200, included: true },
        { logId: "l1", logDate: "2026-09-30", kind: "expense", description: "Km", qty: 1, unitPrice: 35.01, total: 35.01, included: true },
      ],
    },
  ],
  grandTotal: 235.01,
  excludedTotal: 0,
  contractorInvoice: {
    fromCompanyId: CONTRACTOR,
    fromCompanyName: "Lämpökatsastus Oy",
    toCompanyId: OWNER,
    toCompanyName: "Termatek Oy",
    amount: 734,
    description: "Asennusurakka (tarjous − laite)",
  },
};
const ownerSection = contractorInvoiceCalculation(installerCalc, installerCalc.contractorInvoice);
assert.equal(ownerSection.grandTotal, 734);
assert.equal(ownerSection.byUser.length, 1);
assert.deepEqual(ownerSection.byUser[0].lines.map((l) => l.total), [734]);
assert.equal(ownerSection.byUser[0].lines[0].logDate, "2026-09-30");
assert.ok(!JSON.stringify(ownerSection).includes("35.01"), "asentajan rivit eivät näy tilaajalle");

// Tilaajan Laskutus-rivi: saapuva 734 €, kopiointi pois.
const ownerListRow = applyContractorChainToBillingRow(
  {
    id: REPORT,
    title: "x",
    status: "in_progress",
    completed_at: null,
    scheduled_start: null,
    created_at: "2026-09-29T10:00:00+00:00",
    owner_company_id: OWNER,
    created_by_company_id: INSTALLER,
    delegate_company_id: null,
    customers: null,
    owner_company: { name: "Termatek Oy" },
    delegate_company: null,
    billing: {
      partner_invoice_status: "none",
      partner_invoice_amount: 235.01,
      partner_billed_amount: null,
      partner_billed_at: null,
      customer_invoice_status: "none",
      customer_invoice_amount: null,
      customer_billed_at: null,
    },
    billable: { partner_total: 235.01, calculation: installerCalc, billing_quote: {} },
  },
  OWNER,
);
assert.equal(billingRowAmount(ownerListRow), 734);
assert.equal(isContractorChainLegRow(ownerListRow), true);

// --- Migraatio: vain SECURITY DEFINER -funktiot, ei taulujen RLS-muutoksia ---
const sql = readFileSync(
  new URL("../supabase/migrations/20261002230000_contractor_chain_invoice_access.sql", import.meta.url),
  "utf8",
);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.contractor_chain_invoice_reports\(\)/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_contractor_chain_invoice_billed\(/);
assert.equal((sql.match(/^SECURITY DEFINER$/gm) ?? []).length, 2);
assert.equal((sql.match(/SET search_path = public/g) ?? []).length, 2);
assert.doesNotMatch(sql, /CREATE POLICY|ALTER POLICY|DROP POLICY|ALTER TABLE|GRANT (SELECT|UPDATE|ALL) ON/i);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.contractor_chain_invoice_reports\(\) FROM PUBLIC, anon;/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_contractor_chain_invoice_billed\(uuid, boolean\) TO authenticated;/);
assert.match(sql, /current_user_role\(\) NOT IN \('admin', 'manager'\)/);

console.log("test-contractor-chain-invoice-access: ok");
