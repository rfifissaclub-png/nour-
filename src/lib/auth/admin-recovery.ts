import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const CODE_TTL_MS = 10 * 60 * 1000;

export function normalizeRecoveryEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function createRecoveryCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function recoveryCodeExpiresAt(now = Date.now()): Date {
  return new Date(now + CODE_TTL_MS);
}

export function hashRecoveryCode(userId: string, purpose: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`${userId}:${purpose}:${code}`).digest("hex");
}

export function recoveryCodeMatches(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export async function sendRecoveryCode(email: string, code: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RECOVERY_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Recovery email delivery is not configured");

  const subject = purpose === "VERIFY_EMAIL"
    ? "Vérification de votre email de récupération NOUR"
    : "Code de récupération de votre compte Admin NOUR";
  const action = purpose === "VERIFY_EMAIL"
    ? "Confirmer cette adresse email dans les paramètres Admin"
    : "réinitialiser le mot de passe de votre compte Administrateur";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: `Votre code NOUR est ${code}. Utilisez-le pour ${action}. Il expire dans 10 minutes. Si vous n'avez pas demandé ce code, ignorez cet email.`,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Recovery email provider returned ${response.status}`);
}
