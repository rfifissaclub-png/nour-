import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || Buffer.byteLength(expected) < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }
  const received = Buffer.from(authorization.slice("Bearer ".length));
  const secret = Buffer.from(expected);
  return received.length === secret.length && timingSafeEqual(received, secret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await db().$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "database_keep_alive_failed",
      error: error instanceof Error ? error.message : "UnknownError",
    }));
    return NextResponse.json(
      { message: "Database health check failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
