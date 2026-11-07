import { resolvePeriod } from "@/lib/payments/period";
import { db } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/identity";
import { requireUser } from "@/lib/auth/guards";
import PaymentsManager, { type PaymentPageData } from "@/components/admin/payments-manager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string; level?: string }>;

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireUser("ADMIN");
  const params = await searchParams;
  const { year, month } = resolvePeriod(params.month);
  const selectedLevelId = typeof params.level === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params.level)
    ? params.level
    : "";

  const [levels, students] = await Promise.all([
    db().level.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db().user.findMany({
      where: {
        role: "STUDENT",
        OR: [
          { isActive: true, enrollments: { some: {} } },
          { payments: { some: { year, month } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        isActive: true,
        codeId: true,
        phone: true,
        enrollments: {
          select: {
            monthlyPrice: true,
            group: {
              select: {
                id: true,
                name: true,
                teacherId: true,
                teacherPercentage: true,
                level: { select: { id: true, name: true } },
                teacher: { select: { fullName: true } },
              },
            },
          },
          orderBy: { group: { name: "asc" } },
        },
        payments: {
          where: { year, month },
          take: 1,
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            lines: {
              select: {
                groupId: true,
                levelId: true,
                groupName: true,
                teacherId: true,
                teacherPercentage: true,
                amount: true,
                teacher: { select: { fullName: true } },
              },
              orderBy: { groupId: "asc" },
            },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const pageData: PaymentPageData = {
    year,
    month,
    selectedLevelId: levels.some(level => level.id === selectedLevelId) ? selectedLevelId : "",
    levels,
    students: students.map(student => ({
      id: student.id,
      fullName: student.fullName,
      isActive: student.isActive,
      codeId: student.codeId,
      phone: student.phone ? normalizePhone(student.phone) : null,
      groups: student.enrollments.map(({ group, monthlyPrice }) => ({
        id: group.id,
        name: group.name,
        levelId: group.level.id,
        levelName: group.level.name,
        teacherId: group.teacherId,
        teacherName: group.teacher.fullName,
        amount: monthlyPrice.toString(),
        teacherPercentage: group.teacherPercentage.toString(),
      })),
      payment: student.payments[0] ? {
        id: student.payments[0].id,
        totalAmount: student.payments[0].totalAmount.toString(),
        paidAmount: student.payments[0].paidAmount.toString(),
        status: student.payments[0].status,
        lines: student.payments[0].lines.map(line => ({
          groupId: line.groupId,
          levelId: line.levelId,
          groupName: line.groupName,
          teacherId: line.teacherId,
          teacherName: line.teacher.fullName,
          amount: line.amount.toString(),
          teacherPercentage: line.teacherPercentage.toString(),
        })),
      } : null,
    })),
  };

  return <PaymentsManager scope={admin.id} data={pageData} />;
}
