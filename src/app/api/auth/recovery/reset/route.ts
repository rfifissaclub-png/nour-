import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import {
  hashRecoveryCode,
  normalizeRecoveryEmail,
  recoveryCodeMatches,
} from "@/lib/auth/admin-recovery";
import { hashAdminPassword, isValidAdminPassword } from "@/lib/auth/password";
import { consumeAttempt } from "@/lib/auth/rate-limit";
import { json, readJsonBody, sameOrigin } from "@/lib/auth/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);

  try {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return json({ message: parsed.message }, parsed.status);
    const body = parsed.value as { email?: unknown; code?: unknown; password?: unknown };
    const email = normalizeRecoveryEmail(body.email);
    const code = typeof body.code === "string" ? body.code : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !/^\d{6}$/.test(code) || !isValidAdminPassword(password)) {
      return json({ message: "Vérifiez l’email, le code à six chiffres et le mot de passe (12 à 128 caractères)." }, 400);
    }

    const rateLimit = await consumeAttempt(`admin-password-recovery-verify:${email}`, 5);
    if (!rateLimit.allowed) return json({ message: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);

    const admin = await db().user.findFirst({
      where: { recoveryEmail: email, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    const challenge = admin ? await db().adminRecoveryChallenge.findUnique({
      where: { userId_purpose: { userId: admin.id, purpose: "RESET_PASSWORD" } },
      select: { id: true, email: true, codeHash: true, attempts: true, expiresAt: true },
    }) : null;
    if (!admin || !challenge || challenge.email !== email || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      return json({ message: "Code invalide ou expiré. Demandez un nouveau code." }, 400);
    }

    const actualHash = hashRecoveryCode(admin.id, "RESET_PASSWORD", code);
    if (!recoveryCodeMatches(challenge.codeHash, actualHash)) {
      const increment = await db().adminRecoveryChallenge.updateMany({
        where: { id: challenge.id, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
      if (increment.count && challenge.attempts + 1 >= 5) {
        await db().adminRecoveryChallenge.deleteMany({ where: { id: challenge.id } });
      }
      return json({ message: "Code invalide ou expiré. Vérifiez le code reçu et réessayez." }, 400);
    }

    const passwordHash = await hashAdminPassword(password);
    const changed = await db().$transaction(async transaction => {
      const consumed = await transaction.adminRecoveryChallenge.deleteMany({
        where: { id: challenge.id, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({ where: { id: admin.id }, data: { passwordHash } });
      await transaction.authSession.deleteMany({ where: { userId: admin.id } });
      return true;
    });
    if (!changed) return json({ message: "Code invalide ou expiré. Demandez un nouveau code." }, 400);

    return json({ message: "Mot de passe réinitialisé. Vous pouvez vous connecter avec votre nouveau mot de passe." });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ message: "Requête invalide." }, 400);
    console.error("NOUR administrator password reset failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ message: "La réinitialisation est momentanément indisponible. Réessayez plus tard." }, 503);
  }
}
