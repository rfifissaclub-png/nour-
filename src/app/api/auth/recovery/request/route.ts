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
import { json, readJsonBody, sameOrigin } from "@/lib/auth/http";

export const runtime = "nodejs";
const GENERIC_RESPONSE = "Si cette adresse est associée à un compte Administrateur, un code de récupération a été envoyé.";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);

  try {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return json({ message: parsed.message }, parsed.status);
    const body = parsed.value as { email?: unknown };
    const email = normalizeRecoveryEmail(body.email);
    if (!email) return json({ message: "Saisissez une adresse email valide." }, 400);

    const rateLimit = await consumeAttempt(`admin-password-recovery:${email}`, 3);
    if (!rateLimit.allowed) return json({ message: "Trop de demandes. Réessayez dans quelques minutes." }, 429);

    const admin = await db().user.findFirst({
      where: { recoveryEmail: email, role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (admin) {
      const code = createRecoveryCode();
      const challenge = await db().adminRecoveryChallenge.upsert({
        where: { userId_purpose: { userId: admin.id, purpose: "RESET_PASSWORD" } },
        create: {
          userId: admin.id,
          purpose: "RESET_PASSWORD",
          email,
          codeHash: hashRecoveryCode(admin.id, "RESET_PASSWORD", code),
          expiresAt: recoveryCodeExpiresAt(),
        },
        update: {
          email,
          codeHash: hashRecoveryCode(admin.id, "RESET_PASSWORD", code),
          attempts: 0,
          expiresAt: recoveryCodeExpiresAt(),
        },
        select: { id: true },
      });

      try {
        await sendRecoveryCode(email, code, "RESET_PASSWORD");
      } catch (error) {
        await db().adminRecoveryChallenge.deleteMany({ where: { id: challenge.id } });
        console.error("NOUR administrator recovery email could not be sent:", error instanceof Error ? error.message : "UnknownError");
      }
    }

    return json({ message: GENERIC_RESPONSE });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "Requête invalide." }, 400);
    console.error("NOUR administrator recovery request failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ message: "La récupération est momentanément indisponible. Réessayez plus tard." }, 503);
  }
}
