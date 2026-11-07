import { allocatePaymentLineCents, moneyToCents } from "../payments/finance";
import { formatDirhams } from "./google-sheet-utils";

export const SCHOOL_MONTHS = [
  { month: 9, name: "Septembre" },
  { month: 10, name: "Octobre" },
  { month: 11, name: "Novembre" },
  { month: 12, name: "Décembre" },
  { month: 1, name: "Janvier" },
  { month: 2, name: "Février" },
  { month: 3, name: "Mars" },
  { month: 4, name: "Avril" },
  { month: 5, name: "Mai" },
  { month: 6, name: "Juin" },
] as const;

export type BackupMonth = { year: number; month: number; name: string };
export type BackupGroup = {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  monthlyPrice: string;
};
export type BackupStudent = {
  id: string;
  codeId: string;
  fullName: string;
  phone: string | null;
  groups: BackupGroup[];
  payments: Array<{
    id: string;
    year: number;
    month: number;
    totalAmount: string;
    paidAmount: string;
    status: "PAID" | "PARTIAL" | "UNPAID";
    lines: Array<{ levelId: string; amount: string }>;
  }>;
};

export function schoolYearMonths(academicYear: number): BackupMonth[] {
  return SCHOOL_MONTHS.map(({ month, name }) => ({
    year: month >= 9 ? academicYear : academicYear + 1,
    month,
    name,
  }));
}

export function levelMonthAmounts(
  student: BackupStudent,
  year: number,
  month: number,
  levelId: string,
): { expectedCents: number; paidCents: number; totalExpectedCents: number; totalPaidCents: number } {
  const payment = student.payments.find(item => item.year === year && item.month === month);
  const currentGroups = student.groups;
  const totalCurrentCents = currentGroups.reduce((sum, group) => sum + moneyToCents(group.monthlyPrice), 0);
  if (!payment) {
    const expectedCents = currentGroups
      .filter(group => group.levelId === levelId)
      .reduce((sum, group) => sum + moneyToCents(group.monthlyPrice), 0);
    return { expectedCents, paidCents: 0, totalExpectedCents: totalCurrentCents, totalPaidCents: 0 };
  }

  const totalExpectedCents = moneyToCents(payment.totalAmount);
  const totalPaidCents = Math.min(moneyToCents(payment.paidAmount), totalExpectedCents);
  let lineCents: number[];
  let lineLevels: string[];
  if (payment.lines.length > 0) {
    lineCents = payment.lines.map(line => moneyToCents(line.amount));
    lineLevels = payment.lines.map(line => line.levelId);
  } else {
    lineCents = currentGroups.map(group => moneyToCents(group.monthlyPrice));
    lineLevels = currentGroups.map(group => group.levelId);
  }
  const allocationTotal = lineCents.reduce((sum, amount) => sum + amount, 0);
  if (allocationTotal !== totalExpectedCents) {
    lineCents = currentGroups.map(group => moneyToCents(group.monthlyPrice));
    lineLevels = currentGroups.map(group => group.levelId);
  }
  const invoiceCents = lineCents.reduce((sum, amount) => sum + amount, 0);
  const paidByLine = invoiceCents === totalExpectedCents
    ? allocatePaymentLineCents(totalPaidCents, totalExpectedCents, lineCents)
    : lineCents.map(() => 0);
  return {
    expectedCents: lineCents.reduce((sum, amount, index) => sum + (lineLevels[index] === levelId ? amount : 0), 0),
    paidCents: paidByLine.reduce((sum, amount, index) => sum + (lineLevels[index] === levelId ? amount : 0), 0),
    totalExpectedCents,
    totalPaidCents,
  };
}

export function buildMonthlyPaymentStatus(paidCents: number, expectedCents: number): string {
  if (expectedCents <= 0) return paidCents > 0 ? `✅ PAYÉ (${formatDirhams(paidCents)})` : "❌ NON PAYÉ";
  if (paidCents > expectedCents) return `✅ PAYÉ (${formatDirhams(paidCents)}) · SURPLUS ${formatDirhams(paidCents - expectedCents)}`;
  if (paidCents === expectedCents) return `✅ PAYÉ (${formatDirhams(paidCents)})`;
  if (paidCents > 0 && expectedCents - paidCents > expectedCents * 0.5) {
    return `⚠️ AVANCE (Reste ${formatDirhams(expectedCents - paidCents)})`;
  }
  if (paidCents > 0) return `⚠️ PARTIEL (${formatDirhams(paidCents)} / ${formatDirhams(expectedCents)})`;
  return "❌ NON PAYÉ";
}
