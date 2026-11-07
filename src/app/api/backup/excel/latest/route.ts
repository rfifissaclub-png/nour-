import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/http";
import { db } from "@/lib/prisma";
import { downloadPrivateObject } from "@/lib/storage/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;

  const backup = await db().backupLog.findFirst({
    where: { type: "EXCEL", status: "SUCCESS", storageKey: { not: null } },
    select: { filename: true, storageKey: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!backup?.storageKey || !backup.filename) {
    return NextResponse.json({ message: "Aucune sauvegarde Excel hebdomadaire stockée n’est disponible." }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const bytes = await downloadPrivateObject(process.env.BACKUP_STORAGE_BUCKET ?? "", backup.storageKey);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body.buffer, {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "stored_excel_download_failed",
      backupFilename: backup.filename,
      error: error instanceof Error ? error.message : "UnknownError",
    }));
    return NextResponse.json({ message: "La sauvegarde stockée ne peut pas être récupérée pour le moment." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
