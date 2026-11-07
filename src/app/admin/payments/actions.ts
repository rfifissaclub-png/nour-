"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { moneyToCents } from "@/lib/payments/finance";
import { currentMoroccoPeriod } from "@/lib/payments/period";
import { enqueueBackupEvent } from "@/lib/backup/events";

export type PaymentUpdateResult =
  | { ok: true; paidAmount: string; status: "PAID" | "PARTIAL" | "UNPAID" }
  | { ok: false; message: string };

type PaymentMode = "PAID" | "PARTIAL" | "UNPAID";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function toCents(value: string | number): number {
  return moneyToCents(value);
}

function amountString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isRetryableTransactionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034");
}

export async function updateStudentPayment(
  studentId: string,
  year: number,
  month: number,
  mode: PaymentMode,
  partialAmount?: string,
): Promise<PaymentUpdateResult> {
  await requireUser("ADMIN");
  if (!isUuid(studentId)) return { ok: false, message: "Identifiant élève invalide." };
  if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, message: "Mois ou année invalide." };
  }
  if (mode !== "PAID" && mode !== "PARTIAL" && mode !== "UNPAID") {
    return { ok: false, message: "Statut de paiement invalide." };
  }

  let requestedCents: number | null = null;
  if (mode === "PARTIAL") {
    if (!partialAmount || !/^\d{1,8}(?:\.\d{1,2})?$/.test(partialAmount)) {
      return { ok: false, message: "Saisissez un montant valide en dirhams." };
    }
    requestedCents = toCents(partialAmount);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await db().$transaction(async tx => {
        const student = await tx.user.findFirst({
          where: { id: studentId, role: "STUDENT", isActive: true },
          select: {
            id: true,
            enrollments: {
              select: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    levelId: true,
                    teacherId: true,
                    teacherPercentage: true,
                  },
                },
                monthlyPrice: true,
              },
            },
          },
        });
        if (!student) return { ok: false as const, error: "Élève introuvable ou compte inactif." };

        let payment = await tx.payment.findUnique({
          where: { studentId_month_year: { studentId, month, year } },
          select: { id: true, totalAmount: true },
        });
        let totalCents = payment ? toCents(payment.totalAmount.toString()) : 0;
        if (!payment) {
          const lines = student.enrollments.map(({ group, monthlyPrice }) => ({
            groupId: group.id,
            levelId: group.levelId,
            teacherId: group.teacherId,
            groupName: group.name,
            amount: monthlyPrice,
            teacherPercentage: group.teacherPercentage,
          }));
          totalCents = lines.reduce((sum, line) => sum + toCents(line.amount.toString()), 0);
          if (mode === "PARTIAL" && (totalCents === 0 || requestedCents === null || requestedCents <= 0 || requestedCents >= totalCents)) {
            return { ok: false as const, error: "L’avance doit être supérieure à 0 et inférieure au total de la facture." };
          }
          if (mode === "UNPAID" && totalCents === 0) {
            return { ok: false as const, error: "Cette facture de montant nul est déjà considérée comme réglée." };
          }
          payment = await tx.payment.create({
            data: {
              studentId,
              month,
              year,
              totalAmount: amountString(totalCents),
              paidAmount: "0.00",
              status: totalCents === 0 ? "PAID" : "UNPAID",
              lines: { create: lines },
            },
            select: { id: true, totalAmount: true },
          });
        }

        totalCents = toCents(payment.totalAmount.toString());
        let paidCents = 0;
        if (mode === "PAID") paidCents = totalCents;
        if (mode === "PARTIAL") {
          if (totalCents === 0 || requestedCents === null || requestedCents <= 0 || requestedCents >= totalCents) {
            return { ok: false as const, error: "L’avance doit être supérieure à 0 et inférieure au total de la facture." };
          }
          paidCents = requestedCents;
        }
        if (mode === "UNPAID" && totalCents === 0) {
          return { ok: false as const, error: "Cette facture de montant nul est déjà considérée comme réglée." };
        }

        const status: "PAID" | "PARTIAL" | "UNPAID" = paidCents === 0 ? "UNPAID" : paidCents === totalCents ? "PAID" : "PARTIAL";
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            paidAmount: amountString(paidCents),
            status,
            paidAt: paidCents === 0 ? null : new Date(),
          },
          select: { id: true, studentId: true, year: true, month: true, totalAmount: true, paidAmount: true, status: true },
        });
        await enqueueBackupEvent(tx, {
          type: "PAYMENT_UPDATED",
          entityId: updatedPayment.id,
          payload: { paymentId: updatedPayment.id },
        });
        return { ok: true as const, paidAmount: amountString(paidCents), status };
      }, { isolationLevel: "Serializable" });

      if (!result.ok) return { ok: false, message: result.error };
      revalidatePath("/admin/payments");
      return { ok: true, paidAmount: result.paidAmount, status: result.status };
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt === 0) continue;
      if (isRetryableTransactionError(error)) break;
      throw error;
    }
  }

  return { ok: false, message: "La facture a été modifiée simultanément. Actualisez la page et réessayez." };
}

export async function registerHistoricalPayments(
  studentId: string,
  year: number,
  months: number[],
): Promise<{ ok: true; recordedMonths: number[] } | { ok: false; message: string }> {
  await requireUser("ADMIN");
  if (!isUuid(studentId)) return { ok: false, message: "Identifiant élève invalide." };
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return { ok: false, message: "Année invalide." };
  }
  if (!Array.isArray(months) || months.length < 1 || months.length > 12
    || months.some(month => !Number.isInteger(month) || month < 1 || month > 12)
    || new Set(months).size !== months.length) {
    return { ok: false, message: "Sélectionnez un ou plusieurs mois valides." };
  }
  const current = currentMoroccoPeriod();
  if (year > current.year || (year === current.year && months.some(month => month > current.month))) {
    return { ok: false, message: "Un mois futur ne peut pas être enregistré comme paiement historique." };
  }

  const orderedMonths = [...months].sort((a, b) => a - b);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await db().$transaction(async tx => {
        const student = await tx.user.findFirst({
          where: { id: studentId, role: "STUDENT", isActive: true },
          select: {
            id: true,
            enrollments: {
              select: {
                monthlyPrice: true,
                group: {
                  select: {
                    id: true,
                    name: true,
                    levelId: true,
                    teacherId: true,
                    teacherPercentage: true,
                  },
                },
              },
            },
          },
        });
        if (!student) return { ok: false as const, error: "Élève introuvable ou compte inactif." };

        const currentLines = student.enrollments.map(({ group, monthlyPrice }) => ({
          groupId: group.id,
          levelId: group.levelId,
          teacherId: group.teacherId,
          groupName: group.name,
          amount: monthlyPrice,
          teacherPercentage: group.teacherPercentage,
        }));
        const currentTotalCents = currentLines.reduce((sum, line) => sum + toCents(line.amount.toString()), 0);
        if (currentTotalCents > 9_999_999_999) {
          return { ok: false as const, error: "Le total mensuel dépasse la limite autorisée." };
        }

        const recordedMonths: number[] = [];
        for (const month of orderedMonths) {
          const existing = await tx.payment.findUnique({
            where: { studentId_month_year: { studentId, month, year } },
            select: { id: true, totalAmount: true, status: true, note: true },
          });
          if (existing?.status === "PAID") continue;

          let paymentId = existing?.id;
          if (!existing) {
            const totalAmount = amountString(currentTotalCents);
            const created = await tx.payment.create({
              data: {
                studentId,
                month,
                year,
                totalAmount,
                paidAmount: totalAmount,
                status: "PAID",
                paidAt: new Date(),
                note: "Paiement historique saisi par l’Admin au tarif actuel lors de l’import.",
                lines: { create: currentLines },
              },
              select: { id: true },
            });
            paymentId = created.id;
          } else {
            await tx.payment.update({
              where: { id: existing.id },
              data: {
                paidAmount: existing.totalAmount,
                status: "PAID",
                paidAt: new Date(),
                note: [existing.note, "Paiement historique confirmé par l’Admin; montant de la facture préexistante conservé."]
                  .filter(Boolean)
                  .join("\n"),
              },
            });
          }

          if (!paymentId) throw new Error("Historical payment was not created correctly");
          await enqueueBackupEvent(tx, {
            type: "PAYMENT_UPDATED",
            entityId: paymentId,
            payload: { paymentId },
          });
          recordedMonths.push(month);
        }
        return { ok: true as const, recordedMonths };
      }, { isolationLevel: "Serializable" });

      if (!result.ok) return { ok: false, message: result.error };
      revalidatePath("/admin/payments");
      return { ok: true, recordedMonths: result.recordedMonths };
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt === 0) continue;
      if (isRetryableTransactionError(error)) break;
      throw error;
    }
  }

  return { ok: false, message: "Les paiements ont été modifiés simultanément. Actualisez la page et réessayez." };
}
