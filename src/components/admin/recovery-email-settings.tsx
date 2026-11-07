"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";

type ApiResult = { message?: string };

export default function RecoveryEmailSettings({ currentEmail }: { currentEmail: string | null }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(currentEmail ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/admin/recovery-email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, currentPassword }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.message || "Impossible d’envoyer le code.");
      setSentTo(email.trim().toLowerCase());
      setCode("");
      setCurrentPassword("");
      setMessage(result.message || "Code envoyé. Vérifiez votre boîte email.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("La demande a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  async function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/admin/recovery-email/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.message || "Le code n’a pas pu être vérifié.");
      setSentTo("");
      setCode("");
      setMessage(result.message || t("Email vérifié et enregistré."));
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La vérification a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Mail size={21} /></span>
        <div>
          <h2 className="font-semibold text-slate-950">{t("Email de récupération")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{currentEmail ? t("Adresse actuellement vérifiée") : t("Aucune adresse vérifiée pour le moment")}</p>
        </div>
      </div>
      {currentEmail && <p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{currentEmail}</p>}
      <form onSubmit={requestCode} className="space-y-3">
        <div>
          <label htmlFor="current-admin-password" className="mb-2 block text-sm font-medium text-slate-700">{t("Mot de passe Admin actuel")}</label>
          <input
            id="current-admin-password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={128}
            required
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            className="field-control"
          />
        </div>
        <label htmlFor="recovery-email" className="block text-sm font-medium text-slate-700">
          {currentEmail ? "Nouvelle adresse email (ou renvoyer un code)" : t("Votre adresse email")}
        </label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
          className="field-control"
          placeholder="exemple@domaine.ma"
        />
        <button disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
          <Mail size={16} />{pending ? "Envoi…" : t("Envoyer un code de vérification")}
        </button>
      </form>

      {sentTo && (
        <form onSubmit={confirmCode} className="mt-5 space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <label htmlFor="recovery-code" className="block text-sm font-semibold text-slate-800"> {t("Code envoyé à")} {sentTo}
          </label>
          <input
            id="recovery-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="field-control font-mono tracking-[0.3em]"
            placeholder="000000"
          />
          <p className="text-xs text-slate-600">{t("Le code expire après 10 minutes.")}</p>
          <button disabled={pending || code.length !== 6} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
            <ShieldCheck size={16} />{pending ? t("Vérification…") : t("Vérifier et enregistrer")}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="shrink-0" />{t(error)}</p>}
      {message && <p role="status" className="mt-4 flex gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="shrink-0" />{t(message)}</p>}
      <p className="mt-5 text-xs leading-5 text-slate-500"> {t("L’adresse n’est activée qu’après vérification du code. Gardez-la à jour et accessible; elle servira à réinitialiser votre mot de passe.")} </p>
    </section>
  );
}
