import { NextRequest } from "next/server";
import { authorizeApi, json } from "@/lib/auth/http";
import { db } from "@/lib/prisma";
export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;
  const { studentId } = await params;
  const yearText = request.nextUrl.searchParams.get("year") ?? "";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(studentId) || !/^[2-9]\d{3}$/.test(yearText)) {
    return json({ message: "Requête invalide." }, 400);
  }
  const student = await db().user.findFirst({ where: { id: studentId, role: "STUDENT" }, select: { id: true } });
  if (!student) return json({ message: "Élève introuvable ou compte inactif." }, 404);
  const payments = await db().payment.findMany({
    where: { studentId, year: Number(yearText) }, orderBy: { month: "asc" },
    select: { month: true, totalAmount: true, paidAmount: true, status: true },
  });
  return json({ payments: payments.map(payment => ({ ...payment, totalAmount: payment.totalAmount.toString(), paidAmount: payment.paidAmount.toString() })) });
}
