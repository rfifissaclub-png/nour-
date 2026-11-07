import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { normalizeIdentity, latinDigits } from "@/lib/auth/identity";
import { verifyPin } from "@/lib/auth/pin";
import { verifyAdminPassword } from "@/lib/auth/password";
import { consumeAttempt } from "@/lib/auth/rate-limit";
import { signSession } from "@/lib/auth/jwt";
import { BLOCKED_MESSAGE, COOKIE_NAME, COOKIE_OPTIONS, HOME, SESSION_SECONDS } from "@/lib/auth/constants";
import { json, sameOrigin } from "@/lib/auth/http";
export const runtime = "nodejs";
function limited(retryAfter: number) {
  const response = json({ message: "Trop de tentatives. Patientez avant de réessayer.", retryAfter }, 429);
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ message: "Format invalide." }, 415);
    if (Number(request.headers.get("content-length")) > 2048) return json({ message: "Requête trop volumineuse." }, 413);
    const raw = await request.text();
    if (raw.length > 2048) return json({ message: "Requête trop volumineuse." }, 413);
    let body: { identifier?: unknown; pin?: unknown; password?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ message: "Requête invalide." }, 400); }
    if (!body || typeof body !== "object") return json({ message: "Requête invalide." }, 400);
    const identity = normalizeIdentity(body.identifier);
    const pin = typeof body.pin === "string" ? latinDigits(body.pin) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identity || (!/^\d{4}$/.test(pin) && password.length === 0)) {
      return json({ message: "Saisissez votre Code ID ou téléphone et votre PIN ou mot de passe." }, 400);
    }
    const ipHeader = process.env.TRUSTED_IP_HEADER;
    if (ipHeader) {
      const ip = request.headers.get(ipHeader)?.split(",")[0]?.trim() || "unknown";
      const ipLimit = await consumeAttempt(`ip:${ip}`, 30);
      if (!ipLimit.allowed) return limited(ipLimit.retryAfter);
    }
    const identifierLimit = await consumeAttempt(`identifier:${identity.kind}:${identity.value}`, 5);
    if (!identifierLimit.allowed) return limited(identifierLimit.retryAfter);
    const users = await db().user.findMany({
      where: identity.kind === "code" ? { codeId: identity.value } : { phone: identity.value },
      take: 2, select: { id: true, pin: true, passwordHash: true, role: true, isActive: true },
    });
    const user = users.length === 1 ? users[0] : undefined;
    if (user) {
      const accountLimit = await consumeAttempt(`account:${user.id}`, 5);
      if (!accountLimit.allowed) return limited(accountLimit.retryAfter);
    }
    const valid = user?.role === "ADMIN"
      ? await verifyAdminPassword(user.passwordHash ?? undefined, password)
      : await verifyPin(user?.pin, pin);
    if (!user || !valid) return json({ message: "Identifiant ou code secret incorrect. Si le téléphone est partagé, utilisez votre Code ID." }, 401);
    if (!user.isActive) {
      const response = json({ message: BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" }, 403);
      response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
      return response;
    }
    const session = await db().authSession.create({ data: {
      userId: user.id, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
    } });
    const token = await signSession(user.id, session.id, user.role);
    const response = json({ redirectTo: HOME[user.role] });
    response.cookies.set(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    console.error("NOUR login unavailable:", error instanceof Error ? `${error.message} | ${error.stack?.replace(/\n/g, " -> ")}` : String(error));
    return json({ message: "Connexion momentanément indisponible. Veuillez réessayer dans quelques instants." }, 503);
  }
}
