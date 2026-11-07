"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Link2, LoaderCircle, Plus } from "lucide-react";
import { createExternalResource, type ResourceActionState } from "@/app/teacher/actions";

type CreatedResource = {
  id: string;
  title: string;
  type: "COURSE" | "EXERCISE" | "EXAM";
  fileUrl: string | null;
  externalLink: string | null;
  examAt: string | null;
  createdAt: string;
};

const initialState: ResourceActionState = {};

export default function ResourceComposer({ groupId, onCreated }: { groupId: string; onCreated: (resource: CreatedResource) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"pdf" | "link">("pdf");
  const [state, action, pending] = useActionState(createExternalResource, initialState);
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function addLink(formData: FormData) {
    const examDate = formData.get("examDate");
    if (typeof examDate === "string" && examDate) {
      const parsed = new Date(examDate);
      if (!Number.isNaN(parsed.getTime())) formData.set("examDate", parsed.toISOString());
    }
    await action(formData);
  }

  async function uploadPdf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPdfError("");
    setPdfMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const examDate = formData.get("examDate");
    if (typeof examDate === "string" && examDate) {
      const parsed = new Date(examDate);
      if (!Number.isNaN(parsed.getTime())) formData.set("examDate", parsed.toISOString());
    }
    setUploading(true);
    try {
      const response = await fetch("/api/teacher/resources", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
        signal: AbortSignal.timeout(60000),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
          ? result.message
          : "L’envoi du PDF a échoué.";
        setPdfError(message);
        return;
      }
      if (typeof result !== "object" || result === null || !("id" in result) || typeof result.id !== "string") {
        setPdfError("Le serveur a enregistré le fichier mais a renvoyé une réponse invalide. Actualisez la page.");
        return;
      }
      const title = String(formData.get("title") ?? "");
      const type = formData.get("type");
      const examAt = formData.get("examDate");
      onCreated({
        id: result.id,
        title,
        type: type === "EXAM" ? "EXAM" : type === "EXERCISE" ? "EXERCISE" : "COURSE",
        fileUrl: "private-pdf",
        externalLink: null,
        examAt: type === "EXAM" && typeof examAt === "string" ? examAt : null,
        createdAt: new Date().toISOString(),
      });
      form.reset();
      setPdfMessage("Le PDF a été ajouté au groupe.");
    } catch {
      setPdfError("Envoi interrompu ou impossible. Vérifiez votre connexion avant de réessayer.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Plus size={17} className="text-primary" />{t("Ajouter une ressource")}</h3><div className="flex rounded-lg bg-slate-200/70 p-0.5" role="group" aria-label={t("Mode d’ajout de ressource")}><button type="button" aria-pressed={mode === "pdf"} onClick={() => setMode("pdf")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${mode === "pdf" ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}><FileUp size={14} />PDF</button><button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${mode === "link" ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}><Link2 size={14} />{t("Lien")}</button></div></div>

      {mode === "pdf" ? (
        <form key={`${groupId}-pdf`} onSubmit={uploadPdf} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <ResourceFields groupId={groupId} suffix="pdf" />
          <div><label htmlFor={`pdf-file-${groupId}`} className="mb-1.5 block text-xs font-medium text-slate-700">{t("Fichier PDF (10 Mo maximum)")}</label><input id={`pdf-file-${groupId}`} name="file" type="file" accept="application/pdf,.pdf" required className="block min-h-11 w-full rounded-xl border border-slate-200 bg-white text-xs text-slate-600 file:mr-3 file:min-h-11 file:border-0 file:bg-blue-50 file:px-3 file:text-xs file:font-semibold file:text-primary" /></div>
          {pdfError && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-800"><AlertCircle size={15} className="mt-0.5 shrink-0" />{pdfError}</p>}
          {pdfMessage && <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 p-2.5 text-xs text-green-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{pdfMessage}</p>}
          <button type="submit" disabled={uploading} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60">{uploading ? <><LoaderCircle size={16} className="animate-spin" />{t("Envoi du PDF…")}</> : <><FileUp size={16} />{t("Envoyer le PDF")}</>}</button>
        </form>
      ) : (
        <form action={addLink} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <ResourceFields groupId={groupId} suffix="link" />
          <div><label htmlFor={`resource-url-${groupId}`} className="mb-1.5 block text-xs font-medium text-slate-700">{t("Lien externe (YouTube, site…)")}</label><input id={`resource-url-${groupId}`} name="externalUrl" type="url" required maxLength={2048} placeholder="https://…" className="field-control" /></div>
          {state.error && <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-xs text-red-800">{t(state.error)}</p>}
          {state.success && <p role="status" className="rounded-xl bg-green-50 p-2.5 text-xs text-green-800">{t(state.success)}</p>}
          <button type="submit" disabled={pending} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"><Link2 size={16} />{pending ? t("Ajout…") : t("Ajouter le lien")}</button>
        </form>
      )}
    </section>
  );
}

function ResourceFields({ groupId, suffix }: { groupId: string; suffix: string }) {
  const { t } = useTranslation();
  const [type, setType] = useState("COURSE");
  return (
    <>
      <div><label htmlFor={`resource-title-${groupId}-${suffix}`} className="mb-1.5 block text-xs font-medium text-slate-700">{t("Titre")}</label><input id={`resource-title-${groupId}-${suffix}`} name="title" required maxLength={200} placeholder={t("Ex. Série d’exercices N°3 — Les suites")} className="field-control" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`resource-type-${groupId}-${suffix}`} className="mb-1.5 block text-xs font-medium text-slate-700">{t("Type")}</label><select id={`resource-type-${groupId}-${suffix}`} name="type" value={type} onChange={event => setType(event.target.value)} className="field-control"><option value="COURSE">{t("COURSE · درس")}</option><option value="EXERCISE">{t("EXERCISE · تمارين")}</option><option value="EXAM">{t("EXAM · فرض محروس")}</option></select></div>
        {type === "EXAM" && <div><label htmlFor={`resource-date-${groupId}-${suffix}`} className="mb-1.5 block text-xs font-medium text-slate-700">{t("Date et heure du devoir")}</label><input id={`resource-date-${groupId}-${suffix}`} name="examDate" type="datetime-local" required className="field-control" /></div>}
      </div>
    </>
  );
}
