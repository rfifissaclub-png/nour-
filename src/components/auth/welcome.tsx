import { getTranslation } from "@/lib/i18n/server";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import LogoutButton from "./logout-button";
export default async function Welcome({ name, codeId, label }: { name: string; codeId: string; label: string }) {
  const { t } = await getTranslation();
  return <main className="mx-auto min-h-screen max-w-5xl p-6 sm:p-10"><header className="flex items-center justify-between gap-4"><Image src="/nour-logo.png" alt="NOUR" width={48} height={74} /><LogoutButton /></header><section className="mt-12 rounded-3xl border border-blue-100 bg-white p-8 shadow-card"><span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">{t(label)}</span><h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("Bienvenue,")} {name}.</h1><p className="mt-3 text-slate-500">{t("Votre connexion est active. Votre identifiant :")} <strong className="text-slate-800">{codeId}</strong></p><div className="mt-8 flex items-center gap-2 text-sm text-success"><ShieldCheck size={18} />{t("Espace personnel protégé")}</div><p className="mt-5 border-t border-slate-100 pt-5 text-sm text-slate-500">{t("Les modules de votre espace seront ajoutés à la prochaine étape.")}</p></section></main>;
}
