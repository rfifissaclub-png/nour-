"use client";
import { useTranslation } from "@/components/i18n/language-provider";

export default function OfflineBanner({ lastUpdatedAt }: { lastUpdatedAt: string | null }) {
  const { t, locale } = useTranslation();
  if (!lastUpdatedAt) return <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{t("Mode Hors-Ligne : Affichage de la dernière sauvegarde locale")}<p className="mt-1 text-xs">{t("Impossible d’afficher les données hors ligne : aucune sauvegarde locale disponible.")}</p></div>;
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastUpdatedAt));
  return <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{t("Mode Hors-Ligne : Affichage de la dernière sauvegarde locale")}<p className="mt-1 text-xs">{t("Dernière mise à jour :")} {formatted}</p></div>;
}
