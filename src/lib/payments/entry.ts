import { moneyToCents } from "./finance";

export type EntryPayment = {
  totalAmount: string;
  paidAmount: string;
  status: "PAID" | "PARTIAL" | "UNPAID";
};

export function getEntryPayment(
  currentGroupPrices: Array<string | number>,
  payment: EntryPayment | null,
): { status: "PAID" | "PARTIAL" | "UNPAID"; remainingCents: number } {
  if (payment) {
    const total = moneyToCents(payment.totalAmount);
    const paid = moneyToCents(payment.paidAmount);
    return { status: payment.status, remainingCents: Math.max(0, total - paid) };
  }
  const total = currentGroupPrices.reduce<number>((sum, price) => sum + moneyToCents(price), 0);
  return { status: total === 0 ? "PAID" : "UNPAID", remainingCents: total };
}
