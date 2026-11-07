import "dotenv/config";
import { db } from "../src/lib/prisma";

const PREFIXES = ["DEMO-LOAD-202611", "NOUR-DEMO26"];
const DEMO_LEVELS = ["DEMO Test - College", "DEMO Test - Tronc Commun", "DEMO Test - 1 Bac", "DEMO Test - 2 Bac"];

async function main() {
  const database = db();
  const target = await database.$queryRaw<{ database: string; server: string; port: number }[]>`
    SELECT current_database() AS database, inet_server_addr()::text AS server, inet_server_port() AS port
  `;
  if (target[0]?.database !== "nour" || target[0]?.server !== "127.0.0.1/32" || target[0]?.port !== 55440) {
    throw new Error("Refusing to clean: this script is restricted to the local disposable nour database on 127.0.0.1:55440");
  }

  const demoUsers = await database.user.findMany({
    where: { OR: PREFIXES.map(prefix => ({ codeId: { startsWith: prefix } })) },
    select: { id: true, role: true },
  });
  const studentIds = demoUsers.filter(user => user.role === "STUDENT").map(user => user.id);
  const teacherIds = demoUsers.filter(user => user.role === "TEACHER").map(user => user.id);
  const levels = await database.level.findMany({
    where: { name: { in: DEMO_LEVELS } },
    select: { id: true },
  });
  const levelIds = levels.map(level => level.id);
  const groups = await database.subjectGroup.findMany({
    where: { levelId: { in: levelIds } },
    select: { id: true, name: true, teacherId: true },
  });
  if (groups.some(group => !group.name.startsWith("DEMO "))) {
    throw new Error("Refusing to clean: a non-demo group exists in a reserved DEMO level.");
  }
  const groupIds = groups.map(group => group.id);
  const groupEnrollments = await database.enrollment.findMany({
    where: { groupId: { in: groupIds } },
    select: { studentId: true },
  });
  if (groupEnrollments.some(enrollment => !studentIds.includes(enrollment.studentId))) {
    throw new Error("Refusing to clean: a non-demo student is enrolled in a demo group.");
  }
  const studentOtherEnrollments = await database.enrollment.count({
    where: { studentId: { in: studentIds }, groupId: { notIn: groupIds } },
  });
  if (studentOtherEnrollments) {
    throw new Error("Refusing to clean: demo students have been enrolled in non-demo groups.");
  }
  const teacherOtherGroups = await database.subjectGroup.count({
    where: { teacherId: { in: teacherIds }, id: { notIn: groupIds } },
  });
  if (teacherOtherGroups) {
    throw new Error("Refusing to clean: demo teachers have been assigned to non-demo groups.");
  }
  const teacherOtherPaymentLines = await database.paymentLine.count({
    where: { teacherId: { in: teacherIds }, payment: { studentId: { notIn: studentIds } } },
  });
  if (teacherOtherPaymentLines) {
    throw new Error("Refusing to clean: demo teachers have payment records for non-demo students.");
  }
  const [demoPaymentIds, demoEnrollmentIds] = await Promise.all([
    database.payment.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }),
    database.enrollment.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } }),
  ]);
  const demoEntityIds = [...demoPaymentIds.map(payment => payment.id), ...demoEnrollmentIds.map(enrollment => enrollment.id)];
  const groupResources = await database.resource.count({ where: { groupId: { in: groupIds } } });

  await database.$transaction(async transaction => {
    await transaction.backupEvent.deleteMany({ where: { entityId: { in: demoEntityIds } } });
    await transaction.resource.deleteMany({ where: { groupId: { in: groupIds } } });
    await transaction.payment.deleteMany({ where: { studentId: { in: studentIds } } });
    await transaction.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await transaction.user.deleteMany({ where: { id: { in: studentIds } } });
    await transaction.subjectGroup.deleteMany({ where: { id: { in: groupIds } } });
    await transaction.user.deleteMany({ where: { id: { in: teacherIds } } });
    await transaction.level.deleteMany({ where: { id: { in: levelIds } } });
  }, { timeout: 120_000 });

  console.log(JSON.stringify({
    result: "Synthetic load-test data removed",
    students: studentIds.length,
    teachers: teacherIds.length,
    groups: groupIds.length,
    levels: levelIds.length,
    resourcesRemoved: groupResources,
    preservedUsers: "All users outside the reserved synthetic prefixes and their data were left untouched.",
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Load-test cleanup failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db().$disconnect();
  });
