import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { verifySession } from "@/lib/auth/jwt";
import { COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/auth/constants";
import { json, sameOrigin } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const claims = token ? await verifySession(token) : null;
    if (claims) await db().authSession.deleteMany({ where: { id: claims.sessionId, userId: claims.userId } });
    const response = json({ redirectTo: "/login" });
    response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  } catch {
    return json({ message: "Déconnexion indisponible. Veuillez réessayer." }, 503);
  }
}
