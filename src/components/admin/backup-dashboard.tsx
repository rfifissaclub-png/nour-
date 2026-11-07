"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw } from "lucide-react";

type BackupRecord = {
  createdAt: string;
  filename: string | null;
  downloadUrl: string | null;
  recordCount: number;
  errorMessage: string | null;
} | null;
type BackupStatus = {
  excel: { lastSuccess: BackupRecord; lastFailure: BackupRecord };
  googleSheets: { lastSuccess: BackupRecord; lastFailure: BackupRecord };
  pendingEvents: number;
  failedEvents: number;
  lastSyncAt: string | null;
};

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "Aucune sauvegarde enregistrée";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function BackupDashboard({ name, codeId }: { name: string; codeId: string }) {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [action, setAction] = useState<"retry-failed" | "full-sync" | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/backup/status", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Status request failed");
      const result: unknown = await response.json();
      if (!isBackupStatus(result)) throw new Error("Invalid backup status response");
      setStatus(result);
      setStatusError("");
    } catch {
      setStatusError("L’état des sauvegardes n’est pas disponible pour le moment.");
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  async function downloadExcel() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch("/api/backup/excel", { cache: "no-store", signal: AbortSignal.timeout(120000) });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "Le téléchargement du registre a échoué.";
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filenameFromHeader(response.headers.get("content-disposition")) ?? `NOUR_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      await refreshStatus();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Le téléchargement du registre a échoué.");
    } finally {
      setDownloading(false);
    }
  }

  async function runAdminAction(nextAction: "retry-failed" | "full-sync") {
    if (action) return;
    setAction(nextAction);
    setActionMessage("");
    try {
      const response = await fetch("/api/backup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction }),
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
          ? result.message
          : "L’opération de sauvegarde a échoué.";
        throw new Error(message);
      }
      setActionMessage(nextAction === "retry-failed"
        ? "Les événements échoués ont été reprogrammés."
        : "La synchronisation complète a été ajoutée à la file.");
      await refreshStatus();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "L’opération de sauvegarde a échoué.");
    } finally {
      setAction(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <div><p className="text-xl font-extrabold tracking-tight text-primary">NOUR<span className="text-amber-500">.</span></p><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Administration ·")} {name}</p></div>
        <button type="button" onClick={() => void refreshStatus()} aria-label={t("Actualiser l’état de sauvegarde")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><RefreshCw size={17} /></button>
      </header>
      <section className="mt-10 rounded-3xl border border-blue-100 bg-white p-6 shadow-card sm:p-8">
        <p className="text-sm font-semibold text-primary">{t("Tableau de bord NOUR")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Bienvenue,")} {name}.</h1>
        <p className="mt-3 text-sm text-slate-500">{t("Votre connexion est active. Votre identifiant :")} <strong className="text-slate-800">{codeId}</strong></p>
        <div className="mt-7 border-t border-slate-100 pt-6">
          <h2 className="text-lg font-semibold text-slate-950">{t("Sauvegardes et synchronisation")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{t("Téléchargez une copie Excel du registre complet ou vérifiez l’état de la synchronisation Google Sheets.")}</p>
          <button type="button" onClick={() => void downloadExcel()} disabled={downloading} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60"><Download size={18} />{downloading ? t("Préparation du registre…") : t("📥 Télécharger le Registre Complet (Excel)")}</button>
          {downloadError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{t(downloadError)}</p>}
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <StatusCard title={t("Dernière sauvegarde Excel")} success={status?.excel.lastSuccess} failure={status?.excel.lastFailure} />
          <StatusCard title={t("Dernière synchronisation Google Sheets")} success={status?.googleSheets.lastSuccess} failure={status?.googleSheets.lastFailure} />
        </div>
        {status?.excel.lastSuccess?.downloadUrl && <a className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10" href={status.excel.lastSuccess.downloadUrl} download>{status.excel.lastSuccess.filename ?? t("Télécharger la dernière sauvegarde hebdomadaire")}</a>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-900">{t("Événements en attente :")} {status?.pendingEvents ?? "—"}</span>
          <span className={`rounded-full px-3 py-1.5 font-medium ${(status?.failedEvents ?? 0) > 0 ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{t("Événements en échec :")} {status?.failedEvents ?? "—"}</span>
        </div>
        {status && status.failedEvents > 0 && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">{t("Des événements de sauvegarde sont en échec. Vérifiez la configuration Google Sheets, puis relancez les synchronisations échouées.")}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => void runAdminAction("retry-failed")} disabled={Boolean(action)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">{action === "retry-failed" ? "Relance…" : t("Relancer les synchronisations échouées")}</button>
          <button type="button" onClick={() => void runAdminAction("full-sync")} disabled={Boolean(action)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50">{action === "full-sync" ? "Planification…" : t("Lancer une synchronisation complète")}</button>
        </div>
        {statusError && <p role="status" className="mt-3 text-sm text-amber-800">{t(statusError)}</p>}
        {actionMessage && <p role="status" className="mt-3 text-sm text-slate-700">{t(actionMessage)}</p>}
        {status?.googleSheets.lastFailure?.errorMessage && <p className="mt-3 text-xs leading-5 text-red-700">{status.googleSheets.lastFailure.errorMessage}</p>}
      </section>
    </main>
  );
}

function StatusCard({ title, success, failure }: { title: string; success?: BackupRecord; failure?: BackupRecord }) {
  const { t, locale } = useTranslation();
  return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="mt-2 flex items-center gap-2 text-xs text-green-800"><CheckCircle2 size={15} />{t("Réussite :")} {t(formatDate(success?.createdAt, locale))}</p>
    {failure && <p className="mt-2 flex items-center gap-2 text-xs text-red-800"><AlertCircle size={15} />{t("Dernier échec :")} {t(formatDate(failure.createdAt, locale))}</p>}
  </section>;
}

function filenameFromHeader(header: string | null): string | null {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function isBackupStatus(value: unknown): value is BackupStatus {
  return typeof value === "object" && value !== null && "excel" in value && "googleSheets" in value &&
    "pendingEvents" in value && "failedEvents" in value &&
    typeof value.pendingEvents === "number" && typeof value.failedEvents === "number";
}
