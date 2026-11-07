import "server-only";
import { db } from "@/lib/prisma";
import { currentMoroccoPeriod } from "@/lib/payments/period";
import { schoolYearMonths, type BackupMonth, type BackupStudent } from "./calculations";

export { buildMonthlyPaymentStatus, levelMonthAmounts, SCHOOL_MONTHS, schoolYearMonths } from "./calculations";
export type { BackupMonth, BackupStudent } from "./calculations";
export type BackupDataset = {
  levels: Array<{ id: string; name: string }>;
  students: BackupStudent[];
  months: BackupMonth[];
  currentPeriod: { year: number; month: number };
  academicYear: number;
};

export async function collectBackupDataset(now = new Date()): Promise<BackupDataset> {
  const currentPeriod = currentMoroccoPeriod(now);
  const academicYear = currentPeriod.month >= 9 ? currentPeriod.year : currentPeriod.year - 1;
  const months = schoolYearMonths(academicYear);
  const [levels, users] = await Promise.all([
    db().level.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db().user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        codeId: true,
        fullName: true,
        phone: true,
        enrollments: {
          select: {
            monthlyPrice: true,
            group: { select: { id: true, name: true, levelId: true, level: { select: { name: true } } } },
          },
          orderBy: { group: { name: "asc" } },
        },
      },
      orderBy: [{ fullName: "asc" }, { codeId: "asc" }],
    }),
  ]);
  const userIds = users.map(user => user.id);
  const payments = userIds.length ? await db().payment.findMany({
    where: { studentId: { in: userIds }, OR: months.map(({ year, month }) => ({ year, month })) },
    select: {
      id: true,
      studentId: true,
      year: true,
      month: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      lines: { select: { levelId: true, amount: true }, orderBy: { levelId: "asc" } },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  }) : [];
  const paymentByStudent = new Map<string, BackupStudent["payments"]>();
  for (const payment of payments) {
    const records = paymentByStudent.get(payment.studentId) ?? [];
    records.push({
      id: payment.id,
      year: payment.year,
      month: payment.month,
      totalAmount: payment.totalAmount.toString(),
      paidAmount: payment.paidAmount.toString(),
      status: payment.status,
      lines: payment.lines.map(line => ({ levelId: line.levelId, amount: line.amount.toString() })),
    });
    paymentByStudent.set(payment.studentId, records);
  }
  return {
    levels,
    months,
    currentPeriod,
    academicYear,
    students: users.map(user => ({
      id: user.id,
      codeId: user.codeId,
      fullName: user.fullName,
      phone: user.phone,
      groups: user.enrollments.map(({ group, monthlyPrice }) => ({
        id: group.id,
        name: group.name,
        levelId: group.levelId,
        levelName: group.level.name,
        monthlyPrice: monthlyPrice.toString(),
      })),
      payments: paymentByStudent.get(user.id) ?? [],
    })),
  };
}
