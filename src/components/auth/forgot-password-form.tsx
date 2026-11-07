"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Mail } from "lucide-react";

type ApiResult = { message?: string };

export default function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.message || t("La demande a échoué. Réessayez."));
      setRequested(true);
      setMessage(result.message || t("Si cette adresse est associée à un compte Admin, un code a été envoyé."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("La demande a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.message || "La réinitialisation a échoué.");
      setMessage(result.message || "Mot de passe réinitialisé.");
      setRequested(false);
      setCode("");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("La réinitialisation a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      {!requested ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="recovery-email" className="mb-2 block text-sm font-medium text-slate-700">{t("Email de récupération")}</label>
            <input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} className="field-control" placeholder="exemple@domaine.ma" />
          </div>
          <button disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
            <Mail size={17} />{pending ? "Envoi…" : t("Recevoir un code")}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-4">
          <div>
            <label htmlFor="recovery-code" className="mb-2 block text-sm font-medium text-slate-700">{t("Code reçu par email")}</label>
            <input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="field-control font-mono tracking-[0.3em]" placeholder="000000" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">{t("Nouveau mot de passe")}</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className="field-control" />
            <p className="mt-1 text-xs text-slate-500">{t("12 caractères minimum. Le code expire après 10 minutes.")}</p>
          </div>
          <button disabled={pending || code.length !== 6} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
            <KeyRound size={17} />{pending ? t("Réinitialisation…") : t("Définir le nouveau mot de passe")}
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="shrink-0" />{t(error)}</p>}
      {message && <p role="status" className="mt-4 flex gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="shrink-0" />{t(message)}</p>}
    </div>
  );
}
