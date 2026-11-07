import { getTranslation } from "@/lib/i18n/server";
import Link from "next/link";
import { AlertCircle, ArrowRight, BookOpen, CalendarClock, CheckCircle2 } from "lucide-react";

type Exam = { id: string; title: string; groupName: string; levelName: string; examAt: string };
type Group = { id: string; name: string; levelName: string; resourceCount: number; upcomingExams: Exam[] };

export type StudentHomeData = {
  fullName: string;
  codeId: string;
  groups: Group[];
  upcomingExams: Exam[];
  payment: { year: number; month: number; totalCents: number; paidCents: number; status: "PAID" | "PARTIAL" | "UNPAID" };
};

const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function StudentHome({ data }: { data: StudentHomeData }) {
  const { t, locale } = await getTranslation();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
      <header className="rounded-3xl bg-nour-gradient p-6 text-white shadow-card sm:p-8">
        <p className="text-sm font-medium text-blue-100">{t("Votre espace NOUR")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("Salam,")} {data.fullName} 👋</h1>
        <p className="mt-2 text-sm text-blue-100">{t("Retrouvez vos matières et les prochaines dates importantes.")}</p>
        <p className="mt-5 inline-flex rounded-xl bg-white/15 px-3 py-2 font-mono text-sm">{data.codeId}</p>
      </header>

      <section id="subjects" aria-labelledby="student-groups-heading" className="mt-8">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-semibold text-primary">{t("Mon parcours")}</p><h2 id="student-groups-heading" className="mt-1 text-xl font-semibold text-slate-950">{t("Mes matières")}</h2></div><span className="text-xs text-slate-500">{data.groups.length} {t("matière")}{data.groups.length === 1 ? "" : "s"}</span></div>
        {data.groups.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{t("Aucune matière n’est encore associée à votre compte. Contactez l’administration du centre.")}</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((group, index) => <Link key={group.id} href={`/student/subjects/${group.id}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${index % 2 ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-primary"}`}><BookOpen size={21} /></span>
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{group.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{group.levelName} · {group.resourceCount} {t("ressource")}{group.resourceCount === 1 ? "" : "s"}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">{t("Voir les cours")}<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
            </Link>)}
          </div>
        )}
      </section>

      <section aria-labelledby="student-exams-heading" className="mt-8">
        <div className="mb-4"><p className="text-sm font-semibold text-amber-700">{t("À retenir")}</p><h2 id="student-exams-heading" className="mt-1 text-xl font-semibold text-slate-950">{t("Prochains devoirs")}</h2></div>
        {data.upcomingExams.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{t("Aucun devoir planifié pour le moment.")}</p> : (
          <ul className="space-y-2">{data.upcomingExams.map(exam => <li key={exam.id} className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700"><CalendarClock size={19} /></span><div><p className="font-semibold text-slate-900">{exam.title}</p><p className="mt-1 text-xs text-slate-600">{exam.groupName} · {exam.levelName}</p><p className="mt-1 text-sm font-medium text-amber-900">{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(exam.examAt))}</p></div></li>)}</ul>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${data.payment.status === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{data.payment.status === "PAID" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}</span>
          <div className="flex-1"><h2 className="font-semibold text-slate-950">{t("Mon règlement ·")} {t(monthNames[data.payment.month - 1])} {data.payment.year}</h2><p className="mt-1 text-sm text-slate-600">{data.payment.status === "PAID" ? t("Votre règlement est à jour.") : `${t("Montant réglé")} : ${formatMoney(data.payment.paidCents)} ${t("MAD")}. ${t("Reste")} : ${formatMoney(Math.max(0, data.payment.totalCents - data.payment.paidCents))} ${t("MAD")}.`}</p><Link href="/student/account" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary">{t("Voir mon compte")}<ArrowRight size={15} /></Link></div>
        </div>
      </section>
    </main>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
