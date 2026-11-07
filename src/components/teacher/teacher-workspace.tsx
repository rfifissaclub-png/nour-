"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useState } from "react";
import { BookOpen, BookOpenCheck, CalendarClock, FilePlus2, FileText, GraduationCap, Link2, Trash2, UsersRound } from "lucide-react";
import { deleteTeacherResource, type ResourceActionState } from "@/app/teacher/actions";
import ResourceComposer from "./resource-composer";

type TeacherResource = {
  id: string;
  title: string;
  type: "COURSE" | "EXERCISE" | "EXAM";
  fileUrl: string | null;
  externalLink: string | null;
  examAt: string | null;
  createdAt: string;
};

export type TeacherGroupData = {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  students: { id: string; fullName: string; codeId: string }[];
  resources: TeacherResource[];
};

const typeLabels = {
  COURSE: "Cours",
  EXERCISE: "Séries",
  EXAM: "Devoirs",
};

export default function TeacherWorkspace({ name, groups, studentCount }: { name: string; groups: TeacherGroupData[]; studentCount: number }) {
  const { t, locale } = useTranslation();
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-7 rounded-3xl bg-nour-gradient p-6 text-white shadow-card sm:p-8">
        <p className="text-sm font-semibold text-blue-100">{t("Espace enseignant")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("Bonjour,")} {name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">{t("Retrouvez uniquement vos groupes, vos ressources pédagogiques et les élèves inscrits à vos cours.")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><BookOpenCheck size={17} />{groups.length} {t("groupe")}{groups.length === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><UsersRound size={17} />{studentCount} {t("élève")}{studentCount === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><FileText size={17} />{groups.reduce((sum, group) => sum + group.resources.length, 0)} {t("ressource")}{groups.reduce((sum, group) => sum + group.resources.length, 0) === 1 ? "" : "s"}</span>
        </div>
      </header>

      {groups.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <GraduationCap size={30} className="mx-auto text-slate-400" />
          <h2 className="mt-4 font-semibold text-slate-900">{t("Aucun groupe affecté")}</h2>
          <p className="mt-2 text-sm text-slate-500">{t("Contactez l’administration du centre NOUR pour vérifier vos affectations.")}</p>
        </section>
      ) : (
        <section aria-label={t("Mes groupes")} className="space-y-5">
          {groups.map(group => <GroupCard key={group.id} group={group} />)}
        </section>
      )}
    </main>
  );
}

function GroupCard({ group }: { group: TeacherGroupData }) {
  const { t, locale } = useTranslation();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [resourceRows, setResourceRows] = useState(group.resources);
  const [deleteState, setDeleteState] = useState<ResourceActionState>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteResource(resource: TeacherResource) {
    if (!window.confirm(`Supprimer « ${resource.title} » ?`)) return;
    setDeleteState({});
    setDeletingId(resource.id);
    try {
      const result = await deleteTeacherResource(resource.id);
      setDeleteState(result);
      if (result.success) setResourceRows(rows => rows.filter(row => row.id !== resource.id));
    } catch {
      setDeleteState({ error: "Suppression impossible. Vérifiez la connexion et réessayez." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{group.levelName}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{group.name}</h2></div>
        <button type="button" aria-expanded={rosterOpen} aria-controls={`students-${group.id}`} onClick={() => setRosterOpen(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><UsersRound size={16} />{group.students.length} {t("élève")}{group.students.length === 1 ? "" : "s"}<span className="text-xs">{rosterOpen ? "Masquer" : "Voir"}</span></button>
      </header>

      {rosterOpen && <div id={`students-${group.id}`} className="border-b border-slate-100 bg-blue-50/40 px-5 py-4 sm:px-6"><h3 className="mb-3 text-sm font-semibold text-slate-800">{t("Élèves inscrits")}</h3>{group.students.length === 0 ? <p className="text-sm text-slate-500">{t("Aucun élève inscrit dans ce groupe.")}</p> : <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.students.map(student => <li key={student.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2"><p className="text-sm font-medium text-slate-800">{student.fullName}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{student.codeId}</p></li>)}</ul>}</div>}

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ResourceComposer groupId={group.id} onCreated={resource => setResourceRows(rows => [resource, ...rows])} />
        <section aria-labelledby={`resources-${group.id}`}>
          <div className="mb-3 flex items-center justify-between gap-3"><h3 id={`resources-${group.id}`} className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen size={18} className="text-primary" />{t("Ressources du groupe")}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{resourceRows.length}</span></div>
          {deleteState.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{t(deleteState.error)}</p>}
          {deleteState.success && <p role="status" className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-800">{t(deleteState.success)}</p>}
          {resourceRows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500"><FilePlus2 size={20} className="mx-auto mb-2 text-slate-400" />{t("Aucune ressource pour le moment.")}</div> : (
            <ul className="space-y-2">
              {resourceRows.map(resource => <li key={resource.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${resource.type === "EXAM" ? "bg-amber-50 text-amber-700" : resource.type === "EXERCISE" ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-primary"}`}><FileText size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-900">{resource.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>{t(typeLabels[resource.type])}</span><span aria-hidden="true">·</span><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(resource.createdAt))}</span></div>
                  {resource.examAt && <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800"><CalendarClock size={14} />{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(resource.examAt))}</p>}
                  {resource.fileUrl && <a href={`/api/resources/${resource.id}/download`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><FileText size={14} />{t("Ouvrir le PDF sécurisé")}</a>}
                  {resource.externalLink && <a href={resource.externalLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><Link2 size={14} />{t("Ouvrir le lien externe")}</a>}
                </div>
                <button type="button" onClick={() => void deleteResource(resource)} disabled={deletingId === resource.id} aria-label={`Supprimer ${resource.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 size={17} /></button>
              </li>)}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
