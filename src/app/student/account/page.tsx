import { getTranslation } from "@/lib/i18n/server";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, CircleDollarSign } from "lucide-react";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { createStudentQrToken } from "@/lib/access/qr";
import { currentMoroccoPeriod } from "@/lib/payments/period";
import { moneyToCents, sumMoneyCents } from "@/lib/payments/finance";

export const dynamic = "force-dynamic";

export default async function StudentAccountPage() {
  const { t, locale } = await getTranslation();
  const user = await requireUser("STUDENT");
  const period = currentMoroccoPeriod();
  const [payment, enrollments, account] = await Promise.all([
    db().payment.findUnique({
      where: { studentId_month_year: { studentId: user.id, ...period } },
      select: { totalAmount: true, paidAmount: true, status: true },
    }),
    db().enrollment.findMany({
      where: { studentId: user.id },
      select: { monthlyPrice: true },
    }),
    db().user.findUniqueOrThrow({ where: { id: user.id }, select: { qrVersion: true } }),
  ]);
  const totalCents = payment
    ? moneyToCents(payment.totalAmount.toString())
    : sumMoneyCents(enrollments.map(({ monthlyPrice }) => monthlyPrice.toString()));
  const paidCents = payment ? moneyToCents(payment.paidAmount.toString()) : 0;
  const status = payment?.status ?? (totalCents === 0 ? "PAID" : "UNPAID");
  const statusText = status === "PAID" ? t("Réglé") : status === "PARTIAL" ? t("Avance reçue") : t("À régler");
  const qrToken = createStudentQrToken(user.codeId, account.qrVersion);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <p className="text-sm font-semibold text-primary">{t("Espace personnel")}</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("Mon compte")}</h1>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="flex items-center gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${status === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{status === "PAID" ? <CheckCircle2 size={21} /> : <CircleDollarSign size={21} />}</span><div><h2 className="font-semibold text-slate-950">{t("Paiement ·")} {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "Africa/Casablanca" }).format(new Date(Date.UTC(period.year, period.month - 1, 15)))}</h2><p className={`mt-0.5 text-sm font-semibold ${status === "PAID" ? "text-green-700" : "text-amber-700"}`}>{statusText}</p></div></div>
        <dl className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">{t("Montant mensuel")}</dt><dd className="mt-1 font-semibold text-slate-900">{formatMoney(totalCents)} {t("MAD")}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">{t("Montant réglé")}</dt><dd className="mt-1 font-semibold text-slate-900">{formatMoney(paidCents)} {t("MAD")}</dd></div><div className="col-span-2 rounded-2xl bg-amber-50 p-4"><dt className="text-xs text-amber-800">{t("Reste à payer")}</dt><dd className="mt-1 font-semibold text-amber-950">{formatMoney(Math.max(0, totalCents - paidCents))} {t("MAD")}</dd></div></dl>
        <p className="mt-3 text-xs leading-5 text-slate-500">{t("Ces informations concernent uniquement votre compte. Pour toute question, contactez l’administration du centre NOUR.")}</p>
      </section>
      <section className="mt-5 rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 text-center shadow-card sm:p-7">
        <p className="text-sm font-semibold text-slate-900">{t("Mon QR code d’accès")}</p><p className="mt-1 text-xs text-slate-500">{t("Présentez-le à l’entrée du centre. Il est signé et ne contient jamais votre PIN.")}</p>
        <div className="mx-auto mt-5 w-fit rounded-3xl border border-blue-100 bg-white p-4 shadow-sm"><QRCodeSVG value={qrToken} size={220} level="M" includeMargin aria-label={`QR code personnel ${user.codeId}`} /></div>
        <p className="mt-4 font-mono text-lg font-bold tracking-wider text-primary">{user.codeId}</p>
      </section>
    </main>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
