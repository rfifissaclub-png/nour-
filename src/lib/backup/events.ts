import "server-only";
import type { BackupEventType, Prisma } from "@/generated/prisma/client";

export async function enqueueBackupEvent(
  transaction: Prisma.TransactionClient,
  event: {
    type: BackupEventType;
    entityId: string;
    payload: Prisma.InputJsonValue;
  },
) {
  return transaction.backupEvent.create({
    data: { ...event, status: "PENDING", nextAttemptAt: new Date() },
  });
}
