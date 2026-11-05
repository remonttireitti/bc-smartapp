import type { BillableCalculation, BillableLine } from './workReportBilling';
import { computePartnerUrakkaFromCustomer, roundUrakkaMoney } from './workReportUrakkaBilling';

// Lehtimoduuli: vain tyyppi-importit workReportBillingiin (ei kiertoviittausta).
//
// Urakan tarvikekulu vähennetään asiakkaalta laskutettavasta summasta ENNEN kumppanijakoa:
//   kumppanilasku = osuus % × (asiakashinta − toteutuneet tarvikekulut)
//   kumppanille jää = (asiakashinta − tarvikekulut) − kumppanilasku
// Tarvikkeet ovat siis jaettavan summan vähennys, eivät urakoitsijan omia kuluja (ei kahdesti).

export const URAKKA_MATERIAL_LOG_ID = 'auto-urakka-material';

export type UrakkaMaterialSplit = {
  /** Asiakkaalta laskutettava urakkahinta. */
  customerNet: number;
  /** Toteutuneet tarvikekulut, jotka vähennetään (rajattu 0…asiakashinta). */
  materialsNet: number;
  /** Jaettava summa = asiakashinta − tarvikekulut. */
  potNet: number;
  /** Kumppanilta laskutettava osuus jaettavasta summasta. */
  partnerBillNet: number;
  /** Kumppanille jäävä osuus jaettavasta summasta. */
  partnerKeepsNet: number;
};

/** Kumppanijako: osuus % laskutetaan kumppanilta jaettavasta summasta (asiakashinta − tarvikkeet). */
export function computeUrakkaMaterialSplit(
  customerNet: number,
  partnerPercent: number,
  materialsNet: number,
): UrakkaMaterialSplit {
  const customer = roundUrakkaMoney(Math.max(0, Number(customerNet) || 0));
  const materials = roundUrakkaMoney(Math.min(customer, Math.max(0, Number(materialsNet) || 0)));
  const pot = roundUrakkaMoney(customer - materials);
  const partnerBill = computePartnerUrakkaFromCustomer(pot, 100 - partnerPercent);
  return {
    customerNet: customer,
    materialsNet: materials,
    potNet: pot,
    partnerBillNet: partnerBill,
    partnerKeepsNet: roundUrakkaMoney(pot - partnerBill),
  };
}

/** Kumppanilaskun muutos (≤ 0) verrattuna jakoon ilman tarvikevähennystä. */
export function urakkaMaterialBillDelta(customerNet: number, partnerPercent: number, materialsNet: number): number {
  const without = computeUrakkaMaterialSplit(customerNet, partnerPercent, 0).partnerBillNet;
  const withMaterials = computeUrakkaMaterialSplit(customerNet, partnerPercent, materialsNet).partnerBillNet;
  return roundUrakkaMoney(withMaterials - without) || 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100 || 0;
}

function recalcUser(user: BillableCalculation['byUser'][number], lines: BillableLine[]) {
  const fixedTotal = round2(
    lines.reduce((sum, line) => sum + (line.kind === 'fixed_price' && line.included ? line.total : 0), 0),
  );
  const subtotal = round2(user.hoursTotal + user.expensesTotal + fixedTotal + user.commissionTotal);
  return { ...user, lines, fixedTotal, subtotal };
}

function withTotals(calculation: BillableCalculation, byUser: BillableCalculation['byUser']): BillableCalculation {
  return {
    ...calculation,
    byUser,
    grandTotal: round2(byUser.reduce((sum, user) => sum + user.subtotal, 0)),
    excludedTotal: round2(byUser.reduce((sum, user) => sum + user.excludedSubtotal, 0)),
  };
}

/** Poistaa synteettisen tarvikevähennysrivin (idempotentti). */
export function stripUrakkaMaterialDeduction(calculation: BillableCalculation): BillableCalculation {
  let changed = false;
  const byUser = calculation.byUser.map((user) => {
    if (!user.lines.some((line) => line.logId === URAKKA_MATERIAL_LOG_ID)) return user;
    changed = true;
    const lines = user.lines.filter((line) => line.logId !== URAKKA_MATERIAL_LOG_ID);
    return recalcUser(user, lines);
  });
  return changed ? withTotals(calculation, byUser) : calculation;
}

/** Lisää kumppanilaskulle negatiivisen urakkarivin (tarvikekulu vähennettynä ennen jakoa). */
export function mergeUrakkaMaterialDeduction(
  calculation: BillableCalculation,
  options: { amount: number; description: string; logDate: string },
): BillableCalculation {
  const base = stripUrakkaMaterialDeduction(calculation);
  const amount = round2(options.amount);
  if (!(amount < -0.005)) return base;
  const line: BillableLine = {
    logId: URAKKA_MATERIAL_LOG_ID,
    logDate: options.logDate,
    kind: 'fixed_price',
    description: options.description,
    qty: 1,
    unitPrice: amount,
    total: amount,
    included: true,
  };
  // Rivi menee ensimmäiselle käyttäjälle, jolla on urakkarivi (muuten ensimmäiselle).
  const index = Math.max(
    0,
    base.byUser.findIndex((user) => user.lines.some((l) => l.kind === 'fixed_price' && l.included)),
  );
  const byUser = base.byUser.map((user, i) => (i === index ? recalcUser(user, [...user.lines, line]) : user));
  return withTotals(base, byUser);
}

/** Urakan kumppanilaskun rivit ilman synteettistä tarvikevähennystä (yhteenveto laskee sen itse). */
export function isUrakkaMaterialLine(line: { logId?: string }): boolean {
  return line.logId === URAKKA_MATERIAL_LOG_ID;
}
