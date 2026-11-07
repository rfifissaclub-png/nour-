"use client";
import { useTranslation } from "@/components/i18n/language-provider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff, HelpCircle, LoaderCircle, UserRound } from "lucide-react";
import { latinDigits } from "@/lib/auth/identity";
import { HOME } from "@/lib/auth/constants";
export default function LoginForm({ initialMessage = "", initialIdentifier = "" }: { initialMessage?: string; initialIdentifier?: string }) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [secret, setSecret] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [seconds, setSeconds] = useState(0);
  const secretInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (seconds <= 0) return;
    const timeout = window.setTimeout(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [seconds]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || seconds > 0) return;
    const normalizedSecret = latinDigits(secret);
    const isPin = /^\d{4}$/.test(normalizedSecret);
    if (!identifier.trim() || (!isPin && (normalizedSecret.length < 12 || normalizedSecret.length > 128))) {
      setMessage(t("Saisissez votre identifiant et le code secret remis par le centre."));
      secretInput.current?.focus();
      return;
    }
    submitting.current = true; setPending(true); setMessage("");
    let navigating = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPin ? { identifier, pin: normalizedSecret } : { identifier, password: secret }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || t("La connexion a échoué. Veuillez réessayer."));
        if (response.status === 429) setSeconds(Math.min(900, Math.max(1, Number(data.retryAfter) || 60)));
        setSecret(""); secretInput.current?.focus(); return;
      }
      if (!Object.values(HOME).includes(data.redirectTo)) throw new Error("Invalid destination");
      navigating = true;
      window.location.assign(data.redirectTo);
    } catch { setMessage(t("Impossible de se connecter. Vérifiez votre connexion et réessayez.")); }
    finally { if (!navigating) { setPending(false); submitting.current = false; } }
  }
  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
      <div>
        <label htmlFor="identifier" className="mb-2.5 block text-sm font-semibold text-slate-800">{t("Code ID ou téléphone")}</label>
        <div className="relative"><UserRound aria-hidden="true" size={19} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" /><input id="identifier" name="username" autoComplete="username" autoCapitalize="characters" spellCheck={false} maxLength={80} required value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="NOUR-1042 ou 06 12 34 56 78" disabled={pending} aria-describedby="identifier-help" className="h-14 w-full rounded-2xl border border-slate-200 bg-white pe-4 ps-12 text-base text-slate-900 shadow-sm transition placeholder:text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-60" /></div>
        <p id="identifier-help" className="mt-2 text-xs text-slate-500">{t("Utilisez les identifiants remis par votre centre.")}</p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between"><label htmlFor="secret" className="text-sm font-semibold text-slate-800">{t("Code secret")}</label><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? t("Masquer le code secret") : t("Afficher le code secret")} aria-pressed={visible} className="flex min-h-touch items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-500 hover:text-primary">{visible ? <EyeOff size={16} /> : <Eye size={16} />}{visible ? t("Masquer") : t("Afficher")}</button></div>
        <input suppressHydrationWarning ref={secretInput} id="secret" name="password" type={visible ? "text" : "password"} autoComplete="current-password" maxLength={128} required value={secret} onChange={event => setSecret(event.target.value)} disabled={pending} aria-describedby="secret-help" className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-60" />
        <p id="secret-help" className="mt-3 text-xs text-slate-500">{t("Élève ou professeur : PIN à 4 chiffres. Compte Admin : mot de passe de 12 caractères minimum.")}</p>
      </div>
      {message && <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><AlertCircle className="mt-0.5 shrink-0" size={18} /><p>{t(message)}</p></div>}
      <button type="submit" disabled={pending || seconds > 0} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-700/15 transition hover:bg-primary-hover focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65 motion-reduce:transform-none">
        {pending ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" size={19} />{t("Connexion en cours…")}</> : seconds > 0 ? `Réessayer dans ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : <>{t("Accéder à mon espace")}<ArrowRight size={18} /></>}
      </button>
      <Link href="/forgot-password" className="block text-center text-sm font-semibold text-primary hover:underline">{t("Mot de passe oublié ?")}</Link>
      <details className="group rounded-2xl border border-slate-200 bg-white/60 px-4 py-1"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 text-sm font-medium text-slate-600"><HelpCircle size={17} className="text-primary" />{t("Besoin d’aide pour vous connecter ?")}<span className="ms-auto text-lg text-slate-400 group-open:rotate-45" aria-hidden="true">+</span></summary><p className="pb-4 text-sm leading-6 text-slate-500">{t("PIN oublié ou pas encore d’identifiant ? Adressez-vous à l’administration du centre NOUR. Si vous avez oublié le mot de passe Admin, utilisez le lien de récupération par email. Les comptes sont créés directement par le centre.")}</p></details>
    </form>
  );
}
