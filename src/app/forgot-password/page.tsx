import { getTranslation } from "@/lib/i18n/server";
import Link from "next/link";
import Image from "next/image";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const { t } = await getTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <Image src="/nour-logo.png" alt="Logo NOUR" width={40} height={60} className="h-12 w-8 object-contain" />
          <div><p className="font-bold text-primary">NOUR</p><p className="text-xs text-slate-500">{t("Récupération du compte Admin")}</p></div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{t("Mot de passe oublié ?")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("Recevez un code temporaire sur l’email de récupération vérifié de votre compte Administrateur.")}</p>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-5 inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">{t("Retour à la connexion")}</Link>
      </section>
    </main>
  );
}
