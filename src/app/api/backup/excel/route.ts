import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/http";
import { buildExcelBackup } from "@/lib/backup/excel";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;
  let filename = "";
  try {
    const backup = await buildExcelBackup();
    filename = backup.filename;
    await db().backupLog.create({
      data: { type: "EXCEL", status: "SUCCESS", filename, recordCount: backup.recordCount, initiatedBy: auth.user.id },
    });
    const body = new Uint8Array(backup.buffer.byteLength);
    body.set(backup.buffer);
    return new NextResponse(body.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Excel backup failed").slice(0, 1500);
    try {
      await db().backupLog.create({
        data: { type: "EXCEL", status: "FAILED", filename: filename || null, errorMessage: message, initiatedBy: auth.user.id },
      });
    } catch (logError) {
      console.error(JSON.stringify({ event: "excel_backup_log_failed", error: logError instanceof Error ? logError.name : "UnknownError" }));
    }
    console.error(JSON.stringify({ event: "excel_backup_failed", adminId: auth.user.id, error: message }));
    return NextResponse.json({ message: "La génération du fichier Excel a échoué. Réessayez ou contactez l’administration technique." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
