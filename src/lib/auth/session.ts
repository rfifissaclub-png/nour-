import { db } from "@/lib/prisma";
import { verifySession } from "./jwt";
export async function readSession(token: string | undefined) {
  if (!token) return { status: "anonymous" as const };
  const claims = await verifySession(token);
  if (!claims) return { status: "anonymous" as const };
  const session = await db().authSession.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true, expiresAt: true, user: {
      select: { id: true, fullName: true, codeId: true, role: true, isActive: true },
    } },
  });
  if (!session || session.userId !== claims.userId || session.expiresAt <= new Date()) return { status: "anonymous" as const };
  if (!session.user.isActive) return { status: "blocked" as const };
  if (session.user.role !== claims.role) return { status: "anonymous" as const };
  return { status: "authenticated" as const, user: session.user, sessionId: claims.sessionId };
}
