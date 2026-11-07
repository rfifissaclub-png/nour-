import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { authorizeApi, json, sameOrigin } from "@/lib/auth/http";
import { verifyStudentQrToken } from "@/lib/access/qr";
import { currentMoroccoPeriod } from "@/lib/payments/period";
import { getEntryPayment } from "@/lib/payments/entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ message: "Requête JSON invalide." }, 400);
  }
  if (typeof payload !== "object" || payload === null || !("qrToken" in payload)) {
    return json({ message: "Code QR invalide." }, 400);
  }
  const qr = verifyStudentQrToken(payload.qrToken);
  if (!qr) return json({ message: "Ce QR code est invalide ou a été révoqué. Demandez une nouvelle carte à l’administration." }, 400);

  const student = await db().user.findUnique({
    where: { codeId: qr.codeId },
    select: {
      id: true,
      fullName: true,
      codeId: true,
      qrVersion: true,
      role: true,
      isActive: true,
      enrollments: { select: { monthlyPrice: true } },
    },
  });
  if (!student || student.role !== "STUDENT") return json({ message: "Aucun élève trouvé pour ce Code ID." }, 404);
  if (student.qrVersion !== qr.version) return json({ message: "Cette carte a été remplacée. Demandez la carte d’accès la plus récente." }, 400);
  if (!student.isActive) return json({ message: "Ce compte élève est désactivé. Contactez l’administration.", codeId: student.codeId, fullName: student.fullName, status: "INACTIVE" }, 200);

  const period = currentMoroccoPeriod();
  const payment = await db().payment.findUnique({
    where: { studentId_month_year: { studentId: student.id, ...period } },
    select: { totalAmount: true, paidAmount: true, status: true },
  });
  const entry = getEntryPayment(
    student.enrollments.map(({ monthlyPrice }) => monthlyPrice.toString()),
    payment ? {
      totalAmount: payment.totalAmount.toString(),
      paidAmount: payment.paidAmount.toString(),
      status: payment.status,
    } : null,
  );

  return json({
    codeId: student.codeId,
    fullName: student.fullName,
    status: entry.status,
    year: period.year,
    month: period.month,
    remainingCents: entry.remainingCents,
  });
}
