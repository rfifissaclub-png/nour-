import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { currentMoroccoPeriod } from "@/lib/payments/period";
import { moneyToCents, sumMoneyCents } from "@/lib/payments/finance";
import StudentHome, { type StudentHomeData } from "@/components/student/student-home";

export const dynamic = "force-dynamic";

export default async function StudentHomePage() {
  const user = await requireUser("STUDENT");
  const period = currentMoroccoPeriod();
  const now = new Date();
  const [student, payment] = await Promise.all([
    db().user.findFirst({
      where: { id: user.id, role: "STUDENT", isActive: true },
      select: {
        fullName: true,
        codeId: true,
        enrollments: {
          select: {
            monthlyPrice: true,
            group: {
              select: {
                id: true,
                name: true,
                monthlyPrice: true,
                level: { select: { name: true } },
                resources: {
                  where: { type: "EXAM", examAt: { gte: now } },
                  select: { id: true, title: true, examAt: true },
                  orderBy: { examAt: "asc" },
                  take: 3,
                },
                _count: { select: { resources: true } },
              },
            },
          },
          orderBy: { group: { name: "asc" } },
        },
      },
    }),
    db().payment.findUnique({
      where: { studentId_month_year: { studentId: user.id, ...period } },
      select: { id: true, totalAmount: true, paidAmount: true, status: true },
    }),
  ]);
  if (!student) throw new Error("Student account is no longer available");

  const groups = student.enrollments.map(({ group }) => ({
    id: group.id,
    name: group.name,
    levelName: group.level.name,
    resourceCount: group._count.resources,
    upcomingExams: group.resources.flatMap(resource => resource.examAt ? [{
      id: resource.id,
      title: resource.title,
      groupName: group.name,
      levelName: group.level.name,
      examAt: resource.examAt.toISOString(),
    }] : []),
  }));
  const monthlyTotal = payment
    ? moneyToCents(payment.totalAmount.toString())
    : sumMoneyCents(student.enrollments.map(({ monthlyPrice }) => monthlyPrice.toString()));
  const paidCents = payment ? moneyToCents(payment.paidAmount.toString()) : 0;
  const paymentStatus = payment?.status ?? (monthlyTotal === 0 ? "PAID" : "UNPAID");

  const homeData: StudentHomeData = {
    fullName: student.fullName,
    codeId: student.codeId,
    groups,
    upcomingExams: groups.flatMap(group => group.upcomingExams).sort((a, b) => a.examAt.localeCompare(b.examAt)).slice(0, 5),
    payment: { year: period.year, month: period.month, totalCents: monthlyTotal, paidCents, status: paymentStatus },
  };
  return <StudentHome data={homeData} />;
}
