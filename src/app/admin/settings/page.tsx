import { getTranslation } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/prisma";
import RecoveryEmailSettings from "@/components/admin/recovery-email-settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { t } = await getTranslation();
  const admin = await requireUser("ADMIN");
  const user = await db().user.findUnique({
    where: { id: admin.id },
    select: { recoveryEmail: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-primary">{t("Sécurité du compte")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Paramètres Admin")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500"> {t("Configurez et vérifiez l’email qui permettra de récupérer votre mot de passe si vous l’oubliez.")} </p>
      </header>
      <RecoveryEmailSettings currentEmail={user?.recoveryEmail ?? null} />
    </main>
  );
}
