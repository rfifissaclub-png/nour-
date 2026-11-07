import { getTranslation } from "@/lib/i18n/server";
import { BookOpenCheck, GraduationCap, UsersRound } from "lucide-react";
import { db } from "@/lib/prisma";
import ClassesManager from "@/components/admin/classes-manager";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const { t } = await getTranslation();
  const [levels, teachers] = await Promise.all([
    db().level.findMany({
      orderBy: { name: "asc" },
      include: {
        groups: {
          orderBy: { name: "asc" },
          include: {
            teacher: { select: { id: true, fullName: true, isActive: true } },
            _count: { select: { enrollments: true } },
          },
        },
      },
    }),
    db().user.findMany({
      where: { role: "TEACHER", isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const groupCount = levels.reduce((total, level) => total + level.groups.length, 0);
  const teacherOptions = teachers.map(({ id, fullName }) => ({ id, fullName }));
  const levelOptions = levels.map(({ id, name }) => ({ id, name }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-primary">{t("Organisation pédagogique")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Niveaux & groupes")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Structurez les niveaux et leurs matières, puis affectez chaque professeur. Le tarif mensuel se définit pour chaque élève à l’inscription.")}</p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<GraduationCap size={19} />} label={t("Niveaux")} value={String(levels.length)} />
        <SummaryCard icon={<BookOpenCheck size={19} />} label={t("Groupes / matières")} value={String(groupCount)} />
        <SummaryCard icon={<UsersRound size={19} />} label={t("Professeurs actifs")} value={String(teachers.length)} />
      </div>

      <ClassesManager levels={levelOptions} teachers={teacherOptions} />

      <section aria-labelledby="existing-levels-title" className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="existing-levels-title" className="text-xl font-semibold text-slate-950">{t("Niveaux enregistrés")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("Consultez les groupes, tarifs et affectations.")}</p>
          </div>
        </div>
        {levels.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t("Aucun niveau pour le moment. Ajoutez votre premier niveau ci-dessus.")}</div>
        ) : (
          <div className="space-y-4">
            {levels.map(level => (
              <article key={level.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
                <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <h3 className="font-semibold text-slate-900">{level.name}</h3>
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{level.groups.length} {t("groupe")}{level.groups.length === 1 ? "" : "s"}</span>
                </header>
                {level.groups.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-slate-500">{t("Aucun groupe dans ce niveau.")}</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {level.groups.map(group => (
                      <div key={group.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1.4fr_1.2fr_auto] sm:items-center">
                        <div><p className="font-medium text-slate-900">{group.name}</p><p className="mt-1 text-xs text-slate-500">{group._count.enrollments} {t("élève")}{group._count.enrollments === 1 ? "" : "s"}</p></div>
                        <p className="text-sm text-slate-600">{group.teacher.fullName}{!group.teacher.isActive && <span className="ml-2 text-xs text-danger">{t("Inactif")}</span>}</p>
                        <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{group.teacherPercentage.toString()} {t("% prof")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

async function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const { t } = await getTranslation();
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</span><div><p className="text-xs font-medium text-slate-500">{t(label)}</p><p className="mt-0.5 text-xl font-semibold text-slate-900">{value}</p></div></div>;
}
