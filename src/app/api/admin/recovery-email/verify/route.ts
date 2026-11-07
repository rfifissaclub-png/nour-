import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { hashRecoveryCode, recoveryCodeMatches } from "@/lib/auth/admin-recovery";
import { authorizeApi, json, readJsonBody, sameOrigin } from "@/lib/auth/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
  const authorization = await authorizeApi(request, "ADMIN");
  if (!authorization.ok) return authorization.response;

  try {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return json({ message: parsed.message }, parsed.status);
    const body = parsed.value as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    if (!/^\d{6}$/.test(code)) return json({ message: "Saisissez le code à six chiffres reçu par email." }, 400);

    const challenge = await db().adminRecoveryChallenge.findUnique({
      where: { userId_purpose: { userId: authorization.user.id, purpose: "VERIFY_EMAIL" } },
      select: { id: true, email: true, codeHash: true, attempts: true, expiresAt: true },
    });
    if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      return json({ message: "Code expiré ou invalide. Demandez un nouveau code." }, 400);
    }

    const actualHash = hashRecoveryCode(authorization.user.id, "VERIFY_EMAIL", code);

    if (!recoveryCodeMatches(challenge.codeHash, actualHash)) {
      const increment = await db().adminRecoveryChallenge.updateMany({
        where: { id: challenge.id, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
      if (increment.count && challenge.attempts + 1 >= 5) {
        await db().adminRecoveryChallenge.deleteMany({ where: { id: challenge.id } });
      }
      return json({ message: "Code invalide. Vérifiez le message reçu et réessayez." }, 400);
    }

    try {
      await db().$transaction(async transaction => {
        const consumed = await transaction.adminRecoveryChallenge.deleteMany({
          where: { id: challenge.id, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        });
        if (consumed.count !== 1) throw new Error("Recovery challenge already used");
        await transaction.user.update({
          where: { id: authorization.user.id },
          data: { recoveryEmail: challenge.email },
        });
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return json({ message: "Cette adresse est déjà utilisée pour un autre compte." }, 409);
      }
      throw error;
    }

    return json({ message: "Email de récupération vérifié et enregistré." });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "Requête invalide." }, 400);
    console.error("NOUR recovery email verification failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ message: "Impossible de vérifier le code pour le moment." }, 503);
  }
}
