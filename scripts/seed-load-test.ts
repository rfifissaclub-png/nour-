import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/prisma";
import { hashPin } from "../src/lib/auth/pin";
import { allocatePaymentLineCents, calculateTeacherShareCents, moneyToCents } from "../src/lib/payments/finance";

const PREFIX = "NOUR-DEMO26";
const DEMO_LEVELS = ["DEMO Test - College", "DEMO Test - Tronc Commun", "DEMO Test - 1 Bac", "DEMO Test - 2 Bac"];
const STUDENT_COUNT = 500;
const TEACHER_COUNT = 12;
const GROUPS_PER_LEVEL = 5;
const BILLING_MONTH = 11;
const BILLING_YEAR = 2026;

type GroupSeed = {
  id: string;
  name: string;
  levelId: string;
  teacherId: string;
  teacherPercentage: string;
};

function seededValue(seed: number, min: number, max: number): number {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return min + Math.floor((value - Math.floor(value)) * (max - min + 1));
}

function priceFor(studentIndex: number, groupIndex: number): string {
  const whole = 140 + seededValue(studentIndex * 31 + groupIndex * 17, 0, 360);
  const cents = [0, 25, 50, 75][seededValue(studentIndex * 7 + groupIndex * 13, 0, 3)];
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const database = db();
  const target = await database.$queryRaw<{ database: string; server: string; port: number }[]>`
    SELECT current_database() AS database, inet_server_addr()::text AS server, inet_server_port() AS port
  `;
  if (target[0]?.database !== "nour" || target[0]?.server !== "127.0.0.1/32" || target[0]?.port !== 55440) {
    throw new Error("Refusing to seed: this script is restricted to the local disposable nour database on 127.0.0.1:55440");
  }

  const existingDemo = await database.user.count({ where: { codeId: { startsWith: PREFIX } } });
  const existingLevels = await database.level.count({ where: { name: { in: DEMO_LEVELS } } });
  if (existingDemo || existingLevels) {
    throw new Error("Synthetic load-test data already exists. Run npm run loadtest:clean before reseeding.");
  }

  const levelIds = DEMO_LEVELS.map(() => randomUUID());
  const teacherIds = Array.from({ length: TEACHER_COUNT }, () => randomUUID());
  const levels = DEMO_LEVELS.map((name, index) => ({ id: levelIds[index], name }));
  const teachers = teacherIds.map((id, index) => ({
    id,
    codeId: `${PREFIX}-T-${String(index + 1).padStart(2, "0")}`,
    fullName: `DEMO Teacher ${String(index + 1).padStart(2, "0")}`,
    pin: "",
    role: "TEACHER" as const,
  }));
  const pinHash = await hashPin("4826");
  for (const teacher of teachers) teacher.pin = pinHash;

  const groups: GroupSeed[] = [];
  for (const [levelIndex, levelId] of levelIds.entries()) {
    for (let groupIndex = 0; groupIndex < GROUPS_PER_LEVEL; groupIndex++) {
      const index = levelIndex * GROUPS_PER_LEVEL + groupIndex;
      groups.push({
        id: randomUUID(),
        name: `DEMO ${["Maths", "Physique", "SVT", "Francais", "Anglais"][groupIndex]}`,
        levelId,
        teacherId: teacherIds[index % TEACHER_COUNT],
        teacherPercentage: String([45, 50, 55, 60, 65, 70][index % 6]),
      });
    }
  }

  const students = Array.from({ length: STUDENT_COUNT }, (_, index) => ({
    id: randomUUID(),
    codeId: `${PREFIX}-S-${String(index + 1).padStart(4, "0")}`,
    fullName: `DEMO Student ${String(index + 1).padStart(4, "0")}`,
    phone: null,
    pin: pinHash,
    role: "STUDENT" as const,
  }));

  const enrollments: { id: string; studentId: string; groupId: string; monthlyPrice: string }[] = [];
  const payments: {
    id: string;
    studentId: string;
    month: number;
    year: number;
    totalAmount: string;
    paidAmount: string;
    status: "PAID" | "PARTIAL" | "UNPAID";
    paidAt: Date | null;
  }[] = [];
  const paymentLines: {
    id: string;
    paymentId: string;
    groupId: string;
    levelId: string;
    teacherId: string;
    groupName: string;
    amount: string;
    teacherPercentage: string;
  }[] = [];
  const shareTotals = new Map<string, number>();
  const counts = { PAID: 0, PARTIAL: 0, UNPAID: 0 };
  let totalBilledCents = 0;
  let totalCollectedCents = 0;
  let totalEnrollmentCount = 0;

  for (const [studentIndex, student] of students.entries()) {
    const levelIndex = studentIndex % levelIds.length;
    const levelGroups = groups.filter(group => group.levelId === levelIds[levelIndex]);
    const enrollmentCount = 2 + seededValue(studentIndex + 21, 0, 2);
    const start = seededValue(studentIndex + 4, 0, levelGroups.length - 1);
    const selectedGroups = Array.from({ length: enrollmentCount }, (_, index) => levelGroups[(start + index) % levelGroups.length]);
    const invoiceLines = selectedGroups.map((group, index) => {
      const amount = priceFor(studentIndex + 1, groups.indexOf(group) + index);
      enrollments.push({ id: randomUUID(), studentId: student.id, groupId: group.id, monthlyPrice: amount });
      return {
        groupId: group.id,
        levelId: group.levelId,
        teacherId: group.teacherId,
        groupName: group.name,
        amount,
        teacherPercentage: group.teacherPercentage,
      };
    });

    const totalCents = invoiceLines.reduce((sum, line) => sum + moneyToCents(line.amount), 0);
    const bucket = studentIndex % 10;
    const status = bucket < 6 ? "PAID" : bucket < 8 ? "PARTIAL" : "UNPAID";
    const paidCents = status === "PAID"
      ? totalCents
      : status === "PARTIAL"
        ? Math.max(1, Math.min(totalCents - 1, Math.floor(totalCents * (45 + seededValue(studentIndex, 0, 44)) / 100)))
        : 0;
    const paymentId = randomUUID();
    const orderedLines = [...invoiceLines].sort((left, right) => left.groupId.localeCompare(right.groupId));
    const linePaidCents = allocatePaymentLineCents(paidCents, totalCents, orderedLines.map(line => moneyToCents(line.amount)));

    payments.push({
      id: paymentId,
      studentId: student.id,
      month: BILLING_MONTH,
      year: BILLING_YEAR,
      totalAmount: (totalCents / 100).toFixed(2),
      paidAmount: (paidCents / 100).toFixed(2),
      status,
      paidAt: paidCents ? new Date(Date.UTC(BILLING_YEAR, BILLING_MONTH - 1, 1 + (studentIndex % 27), 10)) : null,
    });
    orderedLines.forEach((line, index) => {
      paymentLines.push({
        id: randomUUID(),
        paymentId,
        ...line,
      });
      const share = calculateTeacherShareCents(linePaidCents[index], line.teacherPercentage);
      shareTotals.set(line.teacherId, (shareTotals.get(line.teacherId) ?? 0) + share);
    });

    counts[status]++;
    totalBilledCents += totalCents;
    totalCollectedCents += paidCents;
    totalEnrollmentCount += enrollmentCount;
  }

  await database.$transaction(async transaction => {
    await transaction.level.createMany({ data: levels });
    await transaction.user.createMany({ data: teachers });
    await transaction.subjectGroup.createMany({
      data: groups.map(group => ({ ...group, monthlyPrice: "0" })),
    });
    await transaction.user.createMany({ data: students });
    await transaction.enrollment.createMany({ data: enrollments });
    await transaction.payment.createMany({ data: payments });
    await transaction.paymentLine.createMany({ data: paymentLines });
  }, { timeout: 120_000 });

  const lineTotalByPayment = new Map<string, number>();
  for (const line of paymentLines) {
    lineTotalByPayment.set(line.paymentId, (lineTotalByPayment.get(line.paymentId) ?? 0) + moneyToCents(line.amount));
  }
  if (lineTotalByPayment.size !== STUDENT_COUNT || [...lineTotalByPayment.values()].some(total => total <= 0)) {
    throw new Error("Seed validation failed: invoice lines do not cover every synthetic student.");
  }

  console.log(JSON.stringify({
    result: "Synthetic load-test data created",
    period: `${BILLING_YEAR}-${String(BILLING_MONTH).padStart(2, "0")}`,
    levels: levels.length,
    groups: groups.length,
    teachers: teachers.length,
    students: students.length,
    enrollments: totalEnrollmentCount,
    payments: payments.length,
    paymentLines: paymentLines.length,
    statusCounts: counts,
    totalBilledMAD: (totalBilledCents / 100).toFixed(2),
    totalCollectedMAD: (totalCollectedCents / 100).toFixed(2),
    teacherPayrollMAD: ([...shareTotals.values()].reduce((sum, cents) => sum + cents, 0) / 100).toFixed(2),
    cleanup: "npm run loadtest:clean",
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Load-test seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db().$disconnect();
  });
