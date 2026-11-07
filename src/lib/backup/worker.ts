import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/prisma";
import { appendGoogleSyncLog, fullSyncToGoogleSheet, syncToGoogleSheet } from "@/lib/google-sheets-sync";
import { MAX_BACKUP_EVENT_ATTEMPTS, isPermanentBackupError, retryDelaySeconds } from "@/lib/backup/retry";
import { generateAndStoreWeeklyExcelBackup } from "@/lib/backup/weekly-excel";

const CLAIM_LEASE_MS = 10 * 60 * 1000;
const WORKER_LEASE_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 25;

type EventPayload = { studentId?: unknown; paymentId?: unknown };

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown backup synchronization error").slice(0, 1500);
}

function nextRetry(attempt: number): Date {
  return new Date(Date.now() + retryDelaySeconds(attempt) * 1000);
}

async function claimEvents(limit: number) {
  const now = new Date();
  const candidates = await db().backupEvent.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lockedUntil: { lte: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(MAX_BATCH_SIZE, limit)),
  });
  const claimed = [];
  for (const candidate of candidates) {
    const updated = await db().backupEvent.updateMany({
      where: candidate.status === "PROCESSING"
        ? { id: candidate.id, status: "PROCESSING", lockedUntil: { lte: now } }
        : { id: candidate.id, status: candidate.status, nextAttemptAt: { lte: now } },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lockToken: randomUUID(),
        lockedUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
      },
    });
    if (updated.count !== 1) continue;
    const event = await db().backupEvent.findUnique({ where: { id: candidate.id } });
    if (event) claimed.push(event);
  }
  return claimed;
}

async function processOne(event: Awaited<ReturnType<typeof claimEvents>>[number]): Promise<boolean> {
  try {
    const payload = event.payload as EventPayload;
    let records = 0;
    if (event.type === "ENROLLMENT_CREATED" || event.type === "ENROLLMENT_UPDATED") {
      if (typeof payload.studentId !== "string") throw new Error("Enrollment event has no studentId");
      records = await syncToGoogleSheet(event.type, event.entityId);
    } else if (event.type === "PAYMENT_UPDATED") {
      records = await syncToGoogleSheet(event.type, event.entityId);
    } else {
      records = await fullSyncToGoogleSheet();
    }
    const updated = await db().$transaction(async transaction => {
      const claimed = await transaction.backupEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockToken: event.lockToken },
        data: { status: "SYNCED", lastError: null, processedAt: new Date(), lockToken: null, lockedUntil: null },
      });
      if (claimed.count !== 1) return false;
      await transaction.backupLog.create({
        data: { type: "GOOGLE_SHEETS", status: "SUCCESS", recordCount: records },
      });
      return true;
    });
    if (!updated) return false;
    try {
      await appendGoogleSyncLog(event.type, event.entityId, "SUCCESS", `${records} lignes synchronisées`);
    } catch (error) {
      console.error(JSON.stringify({ event: "google_sheets_sync_log_failed", backupEventId: event.id, error: errorText(error) }));
    }
    console.info(JSON.stringify({ event: "backup_event_synced", backupEventId: event.id, type: event.type, records, attempts: event.attempts }));
    return true;
  } catch (error) {
    const message = errorText(error);
    const permanent = isPermanentBackupError(error) || event.attempts >= MAX_BACKUP_EVENT_ATTEMPTS;
    const updated = await db().$transaction(async transaction => {
      const claimed = await transaction.backupEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockToken: event.lockToken },
        data: {
          status: "FAILED",
          lastError: permanent ? `[permanent] ${message}` : message,
          nextAttemptAt: permanent ? new Date("9999-12-31T23:59:59.999Z") : nextRetry(event.attempts),
          lockToken: null,
          lockedUntil: null,
        },
      });
      if (claimed.count !== 1) return false;
      await transaction.backupLog.create({
        data: { type: "GOOGLE_SHEETS", status: "FAILED", errorMessage: message, recordCount: 0 },
      });
      return true;
    });
    if (!updated) return false;
    console.error(JSON.stringify({ event: "backup_event_failed", backupEventId: event.id, type: event.type, attempts: event.attempts, error: message }));
    try {
      await appendGoogleSyncLog(event.type, event.entityId, "FAILED", message);
    } catch (logError) {
      console.error(JSON.stringify({ event: "google_sheets_sync_log_failed", backupEventId: event.id, error: errorText(logError) }));
    }
    return false;
  }
}

export async function processBackupEvents(limit = MAX_BATCH_SIZE): Promise<{ claimed: number; synced: number; failed: number }> {
  const now = new Date();
  const lockToken = randomUUID();
  const lock = await db().backupWorkerLock.updateMany({
    where: { id: 1, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    data: { lockToken, lockedUntil: new Date(now.getTime() + WORKER_LEASE_MS) },
  });
  if (lock.count !== 1) return { claimed: 0, synced: 0, failed: 0 };
  try {
    const events = await claimEvents(limit);
    let synced = 0;
    let failed = 0;
    for (const event of events) {
      const extended = await db().backupWorkerLock.updateMany({
        where: { id: 1, lockToken },
        data: { lockedUntil: new Date(Date.now() + WORKER_LEASE_MS) },
      });
      if (extended.count !== 1) break;
      await db().backupEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockToken: event.lockToken },
        data: { lockedUntil: new Date(Date.now() + CLAIM_LEASE_MS) },
      });
      if (await processOne(event)) synced++;
      else failed++;
    }
    return { claimed: events.length, synced, failed };
  } finally {
    await db().backupWorkerLock.updateMany({
      where: { id: 1, lockToken },
      data: { lockToken: null, lockedUntil: null },
    });
  }
}

export async function runWeeklyBackup(): Promise<{
  fullSyncEventId: string;
  processed: Awaited<ReturnType<typeof processBackupEvents>>[];
  fullSyncStatus: string;
  excelBackup: Awaited<ReturnType<typeof generateAndStoreWeeklyExcelBackup>>;
}> {
  const fullSyncEvent = await db().backupEvent.create({
    data: { type: "FULL_SYNC_REQUESTED", entityId: "weekly", payload: { reason: "weekly-schedule" } },
    select: { id: true },
  });
  const processed = [];
  for (let batch = 0; batch < 5; batch++) {
    const result = await processBackupEvents(MAX_BATCH_SIZE);
    processed.push(result);
    if (result.claimed === 0) break;
  }
  const status = await db().backupEvent.findUniqueOrThrow({
    where: { id: fullSyncEvent.id },
    select: { status: true },
  });
  const excelBackup = await generateAndStoreWeeklyExcelBackup();
  return { fullSyncEventId: fullSyncEvent.id, processed, fullSyncStatus: status.status, excelBackup };
}
