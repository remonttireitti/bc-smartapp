import type { BillableCalculation } from './workReportBilling';

export function billableUsers(calculation: BillableCalculation | null | undefined) {
  return calculation?.byUser ?? [];
}

export function billableUserLines(user: BillableCalculation['byUser'][number]) {
  return user.lines ?? [];
}

export function hasIncludedBillableLines(calculation: BillableCalculation | null | undefined): boolean {
  return billableUsers(calculation).some((user) =>
    billableUserLines(user).some((line) => line.included),
  );
}
