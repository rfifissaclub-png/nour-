import Link from "next/link";
import { getTranslation } from "@/lib/i18n/server";
export default async function NotFound() {
  const { t } = await getTranslation();
  return <main className="mx-auto max-w-lg px-5 py-16 text-center"><p className="font-semibold text-primary">404</p><h1 className="mt-3 text-2xl font-semibold">{t("Page introuvable")}</h1><p className="my-4 text-slate-600">{t("Cette page n’existe pas ou vous n’avez pas accès à cette ressource.")}</p><Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-white">{t("Retour à l’accueil")}</Link></main>;
}
