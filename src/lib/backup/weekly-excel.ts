import "server-only";
import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "@/lib/prisma";
import { buildExcelBackup } from "@/lib/backup/excel";
import { deletePrivateObjectFromBucket, downloadPrivateObject, uploadPrivateObject } from "@/lib/storage/supabase";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function backupBucket(): string {
  const bucket = process.env.BACKUP_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("BACKUP_STORAGE_BUCKET must name a private Supabase Storage bucket");
  return bucket;
}

function retentionDays(): number {
  const configured = process.env.BACKUP_RETENTION_DAYS;
  if (!configured) return 365;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("BACKUP_RETENTION_DAYS must be an integer between 1 and 3650");
  }
  return value;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : "Weekly Excel backup failed").slice(0, 1500);
}

function verifyWorkbook(bytes: Uint8Array): Promise<boolean> {
  const workbook = new ExcelJS.Workbook();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return workbook.xlsx.load(buffer).then(() => workbook.worksheets[0]?.name === "Résumé Financier");
}

async function removeExpiredWeeklyBackups(bucket: string, days: number): Promise<number> {
  const expiresBefore = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const expired = await db().backupLog.findMany({
    where: { type: "EXCEL", status: "SUCCESS", storageKey: { not: null }, createdAt: { lt: expiresBefore } },
    select: { id: true, storageKey: true },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  let removed = 0;
  for (const backup of expired) {
    if (!backup.storageKey) continue;
    await deletePrivateObjectFromBucket(bucket, backup.storageKey);
    await db().backupLog.update({ where: { id: backup.id }, data: { storageKey: null } });
    removed++;
  }
  return removed;
}

export async function generateAndStoreWeeklyExcelBackup(initiatedBy: string | null = null): Promise<{
  filename: string;
  storageKey: string;
  recordCount: number;
  removedExpiredFiles: number;
}> {
  const bucket = backupBucket();
  let filename: string | null = null;
  let storageKey: string | null = null;
  let recordCount = 0;

  try {
    const backup = await buildExcelBackup();
    filename = backup.filename;
    recordCount = backup.recordCount;
    if (!(await verifyWorkbook(backup.buffer))) throw new Error("Generated Excel workbook could not be read back");

    const [, year, month] = /NOUR_Backup_(\d{4})-(\d{2})-\d{2}\.xlsx/.exec(filename) ?? [];
    if (!year || !month) throw new Error("Generated Excel filename has an invalid date");
    storageKey = `weekly/${year}/${month}/${filename.slice(0, -5)}_${randomUUID()}.xlsx`;
    await uploadPrivateObject(bucket, storageKey, new Uint8Array(backup.buffer), XLSX_CONTENT_TYPE);

    const storedBytes = await downloadPrivateObject(bucket, storageKey);
    const originalHash = createHash("sha256").update(backup.buffer).digest("hex");
    const storedHash = createHash("sha256").update(storedBytes).digest("hex");
    if (storedHash !== originalHash || !(await verifyWorkbook(storedBytes))) {
      throw new Error("Stored Excel backup failed its read-back verification");
    }

    await db().backupLog.create({
      data: {
        type: "EXCEL",
        status: "SUCCESS",
        filename,
        storageKey,
        recordCount,
        initiatedBy,
      },
    });
  } catch (error) {
    if (storageKey) {
      try {
        await deletePrivateObjectFromBucket(bucket, storageKey);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          event: "weekly_excel_unverified_object_cleanup_failed",
          error: errorText(cleanupError),
        }));
      }
    }
    const message = errorText(error);
    await db().backupLog.create({
      data: {
        type: "EXCEL",
        status: "FAILED",
        filename,
        storageKey: null,
        recordCount,
        errorMessage: message,
        initiatedBy,
      },
    });
    console.error(JSON.stringify({ event: "weekly_excel_backup_failed", error: message }));
    throw error;
  }

  if (!filename || !storageKey) throw new Error("Weekly backup completed without a stored file reference");
  try {
    const removedExpiredFiles = await removeExpiredWeeklyBackups(bucket, retentionDays());
    return { filename, storageKey, recordCount, removedExpiredFiles };
  } catch (error) {
    const message = `Backup stored successfully, but retention cleanup failed: ${errorText(error)}`;
    await db().backupLog.create({
      data: {
        type: "EXCEL",
        status: "FAILED",
        filename,
        recordCount,
        errorMessage: message,
        initiatedBy,
      },
    });
    console.error(JSON.stringify({ event: "weekly_excel_retention_failed", error: errorText(error) }));
    throw error;
  }
}
