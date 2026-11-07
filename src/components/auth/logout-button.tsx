"use client";
import { useTranslation } from "@/components/i18n/language-provider";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { clearAllBackupCache } from "@/lib/backup/offline-cache";
export default function LogoutButton() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      try {
        await clearAllBackupCache();
      } catch (cacheError) {
        console.error("Could not clear offline admin cache:", cacheError instanceof Error ? cacheError.name : "UnknownError");
      }
      window.location.replace("/login");
    } catch { setError(t("Déconnexion impossible. Réessayez.")); setPending(false); }
  }
  return <div><button onClick={logout} disabled={pending} className="flex min-h-touch items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium disabled:opacity-50"><LogOut size={16} />{pending ? t("Déconnexion…") : t("Se déconnecter")}</button>{error && <p role="alert" className="mt-2 text-sm text-danger">{t(error)}</p>}</div>;
}
