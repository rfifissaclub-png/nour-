import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { authorizeApi, json } from "@/lib/auth/http";
import { normalizePhone } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const view = params.get("view");
  if (view === "students") {
    const [levels, groups, students] = await Promise.all([
      db().level.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db().subjectGroup.findMany({
        select: { id: true, name: true, levelId: true, level: { select: { name: true } } },
        orderBy: [{ level: { name: "asc" } }, { name: "asc" }],
      }),
      db().user.findMany({
        where: { role: "STUDENT" },
        select: {
          id: true, fullName: true, codeId: true, phone: true, isActive: true,
          enrollments: {
              select: {
                id: true,
                monthlyPrice: true,
                group: { select: { id: true, name: true, levelId: true, level: { select: { name: true } } } },
              },
            orderBy: { group: { name: "asc" } },
          },
        },
        orderBy: { fullName: "asc" },
      }),
    ]);
    return json({
      scope: auth.user.id,
      savedAt: new Date().toISOString(),
      data: {
        levels,
        groups: groups.map(group => ({ id: group.id, name: group.name, levelId: group.levelId, levelName: group.level.name })),
        students: students.map(student => ({
          id: student.id,
          fullName: student.fullName,
          codeId: student.codeId,
          phone: student.phone,
          isActive: student.isActive,
          groups: student.enrollments.map(({ id: enrollmentId, monthlyPrice, group }) => ({
            id: group.id, enrollmentId, name: group.name, levelId: group.levelId, levelName: group.level.name,
            monthlyPrice: monthlyPrice.toString(),
          })),
        })),
      },
    });
  }
  if (view !== "payments") return json({ message: "Vue de sauvegarde invalide." }, 400);

  const monthParameter = params.get("month");
  if (!monthParameter || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParameter)) {
    return json({ message: "Le mois de facturation est invalide." }, 400);
  }
  const [yearText, monthText] = monthParameter.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const requestedLevel = params.get("level") ?? "";
  if (requestedLevel && !isUuid(requestedLevel)) return json({ message: "Le niveau sélectionné est invalide." }, 400);

  const [levels, students] = await Promise.all([
    db().level.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db().user.findMany({
      where: {
        role: "STUDENT",
        OR: [{ isActive: true, enrollments: { some: {} } }, { payments: { some: { year, month } } }],
      },
      select: {
        id: true, fullName: true, codeId: true, phone: true, isActive: true,
        enrollments: {
          select: {
            group: {
              select: {
                id: true, name: true, teacherId: true, teacherPercentage: true,
                level: { select: { id: true, name: true } },
                teacher: { select: { fullName: true } },
              },
            },
            monthlyPrice: true,
          },
          orderBy: { group: { name: "asc" } },
        },
        payments: {
          where: { year, month }, take: 1,
          select: {
            id: true, totalAmount: true, paidAmount: true, status: true,
            lines: {
              select: {
                groupId: true, levelId: true, groupName: true, teacherId: true,
                teacherPercentage: true, amount: true, teacher: { select: { fullName: true } },
              },
              orderBy: { groupId: "asc" },
            },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return json({
    scope: auth.user.id,
    savedAt: new Date().toISOString(),
    data: {
      year,
      month,
      selectedLevelId: levels.some(level => level.id === requestedLevel) ? requestedLevel : "",
      levels,
      students: students.map(student => ({
        id: student.id,
        fullName: student.fullName,
        codeId: student.codeId,
        phone: student.phone ? normalizePhone(student.phone) : null,
        isActive: student.isActive,
        groups: student.enrollments.map(({ group, monthlyPrice }) => ({
          id: group.id, name: group.name, levelId: group.level.id, levelName: group.level.name,
          teacherId: group.teacherId, teacherName: group.teacher.fullName,
          amount: monthlyPrice.toString(), teacherPercentage: group.teacherPercentage.toString(),
        })),
        payment: student.payments[0] ? {
          id: student.payments[0].id,
          totalAmount: student.payments[0].totalAmount.toString(),
          paidAmount: student.payments[0].paidAmount.toString(),
          status: student.payments[0].status,
          lines: student.payments[0].lines.map(line => ({
            groupId: line.groupId, levelId: line.levelId, groupName: line.groupName,
            teacherId: line.teacherId, teacherName: line.teacher.fullName,
            amount: line.amount.toString(), teacherPercentage: line.teacherPercentage.toString(),
          })),
        } : null,
      })),
    },
  });
}
