import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processBackupEvents, runWeeklyBackup } from "@/lib/backup/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validWorkerSecret(request: NextRequest): boolean {
  const expected = process.env.BACKUP_CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || Buffer.byteLength(expected) < 32 || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice(7));
  const key = Buffer.from(expected);
  return received.length === key.length && timingSafeEqual(received, key);
}

export async function POST(request: NextRequest) {
  if (!validWorkerSecret(request)) {
    return NextResponse.json({ message: "Accès worker non autorisé." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await processBackupEvents();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ event: "backup_worker_failed", error: error instanceof Error ? error.message : "UnknownError" }));
    return NextResponse.json({ message: "Le traitement de la file de sauvegarde a échoué." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: NextRequest) {
  if (!validWorkerSecret(request)) {
    return NextResponse.json({ message: "Accès worker non autorisé." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runWeeklyBackup();
    const status = result.fullSyncStatus === "SYNCED" ? 200 : 503;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ event: "weekly_backup_failed", error: error instanceof Error ? error.message : "UnknownError" }));
    return NextResponse.json({ message: "La sauvegarde hebdomadaire a échoué; l’événement reste enregistré pour reprise." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
