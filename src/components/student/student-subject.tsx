"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BookOpen, CalendarClock, ExternalLink, FileDown } from "lucide-react";

type Resource = {
  id: string;
  title: string;
  type: "COURSE" | "EXERCISE" | "EXAM";
  fileUrl: string | null;
  externalLink: string | null;
  examAt: string | null;
  createdAt: string;
};

export type StudentSubjectData = {
  groupId: string;
  groupName: string;
  levelName: string;
  resources: Resource[];
};

const tabs = [
  { id: "COURSE", label: "Cours" },
  { id: "EXERCISE", label: "Séries" },
  { id: "EXAM", label: "Devoirs" },
] as const;

export default function StudentSubject({ data }: { data: StudentSubjectData }) {
  const { t, locale } = useTranslation();
  const [selectedTab, setSelectedTab] = useState<Resource["type"]>("COURSE");
  const resources = data.resources.filter(resource => resource.type === selectedTab);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <Link href="/student/home" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-600 hover:text-primary"><ArrowLeft size={17} />{t("Retour à mes matières")}</Link>
      <header className="mt-5 rounded-3xl bg-nour-gradient p-6 text-white shadow-card"><p className="text-sm text-blue-100">{data.levelName}</p><h1 className="mt-1 text-2xl font-semibold">{data.groupName}</h1><p className="mt-2 text-sm text-blue-100">{t("Cours, exercices et évaluations de votre groupe.")}</p></header>
      <div className="mt-6 grid grid-cols-3 border-b border-slate-200" role="tablist" aria-label={t("Ressources par type")}>
        {tabs.map(tab => <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={selectedTab === tab.id} aria-controls="resources-panel" onClick={() => setSelectedTab(tab.id)} className={`min-h-12 border-b-2 text-sm font-semibold ${selectedTab === tab.id ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{t(tab.label)}<span className="ml-1.5 text-xs">({data.resources.filter(resource => resource.type === tab.id).length})</span></button>)}
      </div>
      <section id="resources-panel" role="tabpanel" aria-labelledby={`tab-${selectedTab}`} className="mt-4">
        {resources.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><BookOpen size={23} className="mx-auto text-slate-400" /><p className="mt-3 text-sm text-slate-500">{t("Aucune ressource dans cette rubrique pour le moment.")}</p></div> : <ul className="space-y-3">{resources.map(resource => <li key={resource.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4"><div><h2 className="font-semibold text-slate-900">{resource.title}</h2><p className="mt-1 text-xs text-slate-500">{t("Ajouté le")} {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(resource.createdAt))}</p>{resource.examAt && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-800"><CalendarClock size={14} />{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(resource.examAt))}</p>}</div><div className="mt-4 flex flex-wrap gap-2 sm:mt-0">{resource.fileUrl && <a href={`/api/resources/${resource.id}/download`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover"><FileDown size={16} />{t("Télécharger / Ouvrir PDF")}</a>}{resource.externalLink && <a href={resource.externalLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={16} />{t("Ouvrir le lien")}</a>}</div></li>)}</ul>}
      </section>
    </main>
  );
}
