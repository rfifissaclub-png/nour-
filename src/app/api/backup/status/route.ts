import { NextRequest } from "next/server";
import { authorizeApi, json } from "@/lib/auth/http";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;
  const [excelSuccess, excelFailure, sheetsSuccess, sheetsFailure, pendingEvents, failedEvents] = await Promise.all([
    db().backupLog.findFirst({ where: { type: "EXCEL", status: "SUCCESS" }, orderBy: { createdAt: "desc" } }),
    db().backupLog.findFirst({ where: { type: "EXCEL", status: "FAILED" }, orderBy: { createdAt: "desc" } }),
    db().backupLog.findFirst({ where: { type: "GOOGLE_SHEETS", status: "SUCCESS" }, orderBy: { createdAt: "desc" } }),
    db().backupLog.findFirst({ where: { type: "GOOGLE_SHEETS", status: "FAILED" }, orderBy: { createdAt: "desc" } }),
    db().backupEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    db().backupEvent.count({ where: { status: "FAILED" } }),
  ]);
  const log = (record: typeof excelSuccess) => record ? {
    createdAt: record.createdAt.toISOString(),
    filename: record.filename,
    downloadUrl: record.storageKey ? "/api/backup/excel/latest" : null,
    recordCount: record.recordCount,
    errorMessage: record.errorMessage,
  } : null;
  return json({
    scope: auth.user.id,
    excel: { lastSuccess: log(excelSuccess), lastFailure: log(excelFailure) },
    googleSheets: { lastSuccess: log(sheetsSuccess), lastFailure: log(sheetsFailure) },
    pendingEvents,
    failedEvents,
    lastSyncAt: sheetsSuccess?.createdAt.toISOString() ?? null,
  });
}
