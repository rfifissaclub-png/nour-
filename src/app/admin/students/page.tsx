import { getTranslation } from "@/lib/i18n/server";
import { db } from "@/lib/prisma";
import StudentsManager from "@/components/admin/students-manager";
import { requireUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const { t } = await getTranslation();
  const admin = await requireUser("ADMIN");
  const [levels, groups, students] = await Promise.all([
    db().level.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db().subjectGroup.findMany({
      select: { id: true, name: true, levelId: true, level: { select: { name: true } } },
      orderBy: [{ level: { name: "asc" } }, { name: "asc" }],
    }),
    db().user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        fullName: true,
        codeId: true,
        phone: true,
        isActive: true,
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

  const studentOptions = students.map(student => ({
    id: student.id,
    fullName: student.fullName,
    codeId: student.codeId,
    phone: student.phone,
    isActive: student.isActive,
    groups: student.enrollments.map(({ id: enrollmentId, monthlyPrice, group }) => ({
      id: group.id,
      enrollmentId,
      name: group.name,
      levelId: group.levelId,
      levelName: group.level.name,
      monthlyPrice: monthlyPrice.toString(),
    })),
  }));
  const groupOptions = groups.map(group => ({
    id: group.id,
    name: group.name,
    levelId: group.levelId,
    levelName: group.level.name,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-primary">{t("Comptes & inscriptions")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Gestion des élèves")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Créez les comptes, inscrivez les élèves à leurs matières et remettez leurs cartes d’accès.")}</p>
      </header>
      <StudentsManager scope={admin.id} levels={levels} groups={groupOptions} initialStudents={studentOptions} />
    </main>
  );
}
