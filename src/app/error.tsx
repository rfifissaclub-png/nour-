"use client";
import { useTranslation } from "@/components/i18n/language-provider";
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation();
  return <main className="mx-auto max-w-lg px-5 py-16 text-center"><h1 className="text-2xl font-semibold">{t("Chargement impossible")}</h1><p className="my-4 text-slate-600">{t("Une erreur est survenue. Vérifiez votre connexion puis réessayez.")}</p><button type="button" onClick={retry} className="min-h-11 rounded-xl bg-primary px-5 text-white">{t("Réessayer")}</button></main>;
}
