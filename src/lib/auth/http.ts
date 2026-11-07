import { NextRequest, NextResponse } from "next/server";
import { readSession } from "./session";
import { BLOCKED_MESSAGE, COOKIE_NAME, COOKIE_OPTIONS, type Role } from "./constants";
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const expected = process.env.APP_ORIGIN;
  if (expected) {
    try {
      if (origin === new URL(expected).origin) return true;
    } catch {
      // Format URL invalide dans process.env.APP_ORIGIN, passer au fallback
    }
  }

  // Fallback Vercel / proxy : comparer l'origine avec le host courant
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      return false;
    }
  }

  return false;
}
export async function readJsonBody(request: NextRequest, maxBytes = 2048) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false as const, status: 415, message: "Format invalide." };
  }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return { ok: false as const, status: 413, message: "Requête trop volumineuse." };
  }
  const raw = await request.text();
  if (raw.length > maxBytes) return { ok: false as const, status: 413, message: "Requête trop volumineuse." };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false as const, status: 400, message: "Requête invalide." };
    }
    return { ok: true as const, value: value as Record<string, unknown> };
  } catch {
    return { ok: false as const, status: 400, message: "Requête invalide." };
  }
}
export async function authorizeApi(request: NextRequest, role?: Role) {
  const session = await readSession(request.cookies.get(COOKIE_NAME)?.value);
  if (session.status !== "authenticated") {
    const response = json({ message: session.status === "blocked" ? BLOCKED_MESSAGE : "Veuillez vous connecter." }, session.status === "blocked" ? 403 : 401);
    response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return { ok: false as const, response };
  }
  if (role && session.user.role !== role) return { ok: false as const, response: json({ message: "Accès non autorisé." }, 403) };
  return { ok: true as const, user: session.user };
}
