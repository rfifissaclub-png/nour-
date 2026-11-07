import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import {
  createRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryEmail,
  recoveryCodeExpiresAt,
  sendRecoveryCode,
} from "@/lib/auth/admin-recovery";
import { consumeAttempt } from "@/lib/auth/rate-limit";
import { authorizeApi, json, readJsonBody, sameOrigin } from "@/lib/auth/http";
import { verifyAdminPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
  const authorization = await authorizeApi(request, "ADMIN");
  if (!authorization.ok) return authorization.response;

  try {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return json({ message: parsed.message }, parsed.status);
    const body = parsed.value as { email?: unknown; currentPassword?: unknown };
    const email = normalizeRecoveryEmail(body.email);
    if (!email) return json({ message: "Saisissez une adresse email valide." }, 400);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const currentAdmin = await db().user.findUnique({
      where: { id: authorization.user.id },
      select: { passwordHash: true },
    });
    if (!currentAdmin || !(await verifyAdminPassword(currentAdmin.passwordHash ?? undefined, currentPassword))) {
      return json({ message: "Mot de passe actuel incorrect." }, 401);
    }

    const rateLimit = await consumeAttempt(`admin-recovery-email:${authorization.user.id}`, 3);
    if (!rateLimit.allowed) return json({ message: "Trop de demandes. Réessayez dans quelques minutes." }, 429);

    const existing = await db().user.findFirst({
      where: { recoveryEmail: email, id: { not: authorization.user.id } },
      select: { id: true },
    });
    if (existing) return json({ message: "Cette adresse est déjà utilisée pour un autre compte." }, 409);

    const code = createRecoveryCode();
    const challenge = await db().adminRecoveryChallenge.upsert({
      where: { userId_purpose: { userId: authorization.user.id, purpose: "VERIFY_EMAIL" } },
      create: {
        userId: authorization.user.id,
        purpose: "VERIFY_EMAIL",
        email,
        codeHash: hashRecoveryCode(authorization.user.id, "VERIFY_EMAIL", code),
        expiresAt: recoveryCodeExpiresAt(),
      },
      update: {
        email,
        codeHash: hashRecoveryCode(authorization.user.id, "VERIFY_EMAIL", code),
        attempts: 0,
        expiresAt: recoveryCodeExpiresAt(),
      },
      select: { id: true },
    });

    try {
      await sendRecoveryCode(email, code, "VERIFY_EMAIL");
    } catch (error) {
      await db().adminRecoveryChallenge.deleteMany({ where: { id: challenge.id } });
      console.error("NOUR recovery email verification could not be sent:", error instanceof Error ? error.message : "UnknownError");
      return json({ message: "L’email n’a pas pu être envoyé. Vérifiez la configuration ou réessayez plus tard." }, 503);
    }

    return json({ message: "Un code de vérification a été envoyé à cette adresse." });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "Requête invalide." }, 400);
    console.error("NOUR recovery email setup failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ message: "Impossible de préparer la vérification pour le moment." }, 503);
  }
}
