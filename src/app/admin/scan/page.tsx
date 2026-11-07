import { getTranslation } from "@/lib/i18n/server";
import { QrCode } from "lucide-react";
import AdminQrScanner from "@/components/admin/admin-qr-scanner";

export const dynamic = "force-dynamic";

export default async function AdminScanPage() {
  const { t } = await getTranslation();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-6"><p className="flex items-center gap-2 text-sm font-semibold text-primary"><QrCode size={17} />{t("Contrôle d’accès")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Scanner QR élève")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Scannez le Code ID présenté à l’entrée. Le résultat de paiement est vérifié côté serveur pour le mois courant au Maroc.")}</p></header>
      <AdminQrScanner />
    </main>
  );
}
