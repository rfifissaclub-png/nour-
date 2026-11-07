"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus, School, UserRoundCog, UsersRound } from "lucide-react";
import { createLevel, createSubjectGroup, createTeacher, type FormActionState, type TeacherActionState } from "@/app/admin/actions";

const initialState: FormActionState = {};

type Option = { id: string; name: string };
type Teacher = { id: string; fullName: string };

export default function ClassesManager({ levels, teachers }: { levels: Option[]; teachers: Teacher[] }) {
  const { t } = useTranslation();
  const [levelState, levelAction, levelPending] = useActionState(createLevel, initialState);
  const [groupState, groupAction, groupPending] = useActionState(createSubjectGroup, initialState);
  const [teacherState, teacherAction, teacherPending] = useActionState(createTeacher, initialState as TeacherActionState);

  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]" aria-label={t("Ajouter un niveau ou un groupe")}>
      <div className="space-y-5">
        <form action={levelAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><School size={21} /></span><div><h2 className="font-semibold text-slate-950">{t("Ajouter un niveau")}</h2><p className="mt-0.5 text-xs text-slate-500">{t("Ex. Tronc Commun, 1Bac, 2Bac")}</p></div></div>
          <label htmlFor="level-name" className="mb-2 block text-sm font-medium text-slate-700">{t("Nom du niveau")}</label>
          <input id="level-name" name="name" required maxLength={100} placeholder={t("Ex. Tronc Commun")} className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
          <ActionFeedback state={levelState} />
          <button disabled={levelPending} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60"><Plus size={17} />{levelPending ? t("Ajout…") : t("Ajouter le niveau")}</button>
        </form>

        <form action={teacherAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><UserRoundCog size={21} /></span><div><h2 className="font-semibold text-slate-950">{t("Créer un compte professeur")}</h2><p className="mt-0.5 text-xs text-slate-500">{t("Le PIN est généré automatiquement.")}</p></div></div>
          <div className="space-y-4">
            <Field label={t("Nom complet")} id="teacher-name"><input id="teacher-name" name="fullName" required maxLength={150} placeholder={t("Ex. Karim Benali")} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></Field>
            <Field label={t("Téléphone")} id="teacher-phone"><input id="teacher-phone" name="phone" required type="tel" maxLength={80} placeholder="+212 6 12 34 56 78" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></Field>
          </div>
          <ActionFeedback state={teacherState} />
          {teacherState.success && teacherState.credentials && (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="font-semibold">{t("Compte créé")}</p>
              <p className="mt-1 font-mono">{teacherState.credentials.codeId} / {teacherState.credentials.pin}</p>
            </div>
          )}
          <button disabled={teacherPending} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"><Plus size={17} />{teacherPending ? t("Création…") : t("Créer le compte")}</button>
        </form>
      </div>

      <form action={groupAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><UsersRound size={21} /></span><div><h2 className="font-semibold text-slate-950">{t("Ajouter un groupe / matière")}</h2><p className="mt-0.5 text-xs text-slate-500">{t("Le groupe sera rattaché à un niveau.")}</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Niveau")} id="group-level">
            <select id="group-level" name="levelId" required defaultValue="" disabled={levels.length === 0} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10">
              <option value="" disabled>{t("Choisir un niveau")}</option>
              {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
            </select>
          </Field>
          <Field label={t("Matière / nom du groupe")} id="group-name"><input id="group-name" name="name" required maxLength={150} placeholder={t("Ex. Mathématiques")} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></Field>
          <Field label={t("Professeur responsable")} id="group-teacher">
            <select id="group-teacher" name="teacherId" required defaultValue="" disabled={teachers.length === 0} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10">
              <option value="" disabled>{t("Choisir un professeur")}</option>
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
            </select>
          </Field>
          <Field label={t("Part du professeur (%)")} id="group-percentage"><input id="group-percentage" name="teacherPercentage" type="number" min="0" max="100" step="0.01" required placeholder="60" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /><p className="mt-1 text-xs text-slate-500">{t("Le prix est fixé individuellement pour chaque élève.")}</p></Field>
        </div>
        {levels.length === 0 && <p className="mt-3 text-xs text-amber-800">{t("Ajoutez d’abord un niveau.")}</p>}
        {teachers.length === 0 && <p className="mt-3 text-xs text-amber-800">{t("Aucun professeur actif. Créez ou réactivez un compte professeur.")}</p>}
        <ActionFeedback state={groupState} />
        <button disabled={groupPending || levels.length === 0 || teachers.length === 0} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"><Plus size={17} />{groupPending ? t("Ajout…") : t("Ajouter le groupe")}</button>
      </form>
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{t(label)}</label>{children}</div>;
}

function ActionFeedback({ state }: { state: FormActionState }) {
  const { t } = useTranslation();
  if (state.error) return <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{t(state.error)}</p>;
  if (state.success) return <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{t(state.success)}</p>;
  return null;
}
