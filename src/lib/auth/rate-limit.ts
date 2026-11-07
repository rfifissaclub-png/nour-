import { createHmac } from "node:crypto";
import { db } from "@/lib/prisma";
export async function consumeAttempt(identity: string, limit = 5) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is required");
  const key = createHmac("sha256", secret).update(identity).digest("hex");
  const rows = await db().$queryRaw<{ attempts: number; retryAfter: number }[]>`
    INSERT INTO "AuthRateLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW() THEN 1
        ELSE LEAST("AuthRateLimit"."attempts" + 1, 1000000) END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW()
        THEN NOW() + INTERVAL '15 minutes' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "attempts", CEIL(EXTRACT(EPOCH FROM ("expiresAt" - NOW())))::int AS "retryAfter"
  `;
  return { allowed: rows[0].attempts <= limit, retryAfter: Math.max(1, rows[0].retryAfter) };
}
