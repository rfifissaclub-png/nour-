import { NextRequest } from "next/server";
import { authorizeApi, json, sameOrigin } from "@/lib/auth/http";
import { db } from "@/lib/prisma";
import { processBackupEvents } from "@/lib/backup/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authorizeApi(request, "ADMIN");
  if (!auth.ok) return auth.response;
  if (!sameOrigin(request)) return json({ message: "Origine de requête non autorisée." }, 403);

  let action: unknown;
  try {
    const body: unknown = await request.json();
    action = typeof body === "object" && body !== null && "action" in body ? body.action : null;
  } catch {
    return json({ message: "Requête JSON invalide." }, 400);
  }

  if (action === "retry-failed") {
    const retried = await db().backupEvent.updateMany({
      where: { status: "FAILED" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockToken: null, lockedUntil: null },
    });
    const processed = await processBackupEvents();
    return json({ queued: retried.count, processed });
  }
  if (action === "full-sync") {
    const event = await db().backupEvent.create({
      data: { type: "FULL_SYNC_REQUESTED", entityId: "admin", payload: { reason: "admin-request" } },
      select: { id: true },
    });
    const processed = await processBackupEvents();
    const current = await db().backupEvent.findUniqueOrThrow({
      where: { id: event.id },
      select: { status: true, lastError: true },
    });
    return json({ eventId: event.id, status: current.status, error: current.lastError, processed }, current.status === "FAILED" ? 503 : 202);
  }

  return json({ message: "Action de sauvegarde invalide." }, 400);
}
