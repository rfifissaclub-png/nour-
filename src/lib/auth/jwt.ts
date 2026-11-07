import { SignJWT, jwtVerify } from "jose";
import { ROLES, SESSION_SECONDS, type Role } from "./constants";
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) throw new Error("AUTH_SECRET must contain at least 32 random bytes");
  return new TextEncoder().encode(secret);
}
export async function signSession(userId: string, sessionId: string, role: Role) {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId).setJti(sessionId).setIssuer("nour-centre")
    .setAudience("nour-web").setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(key());
}
export async function verifySession(token: string) {
  const secret = key();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"], issuer: "nour-centre", audience: "nour-web",
      requiredClaims: ["sub", "jti", "iat", "exp", "role"], maxTokenAge: `${SESSION_SECONDS}s`,
    });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!payload.sub || !uuid.test(payload.sub) || !payload.jti || !uuid.test(payload.jti) || !ROLES.includes(payload.role as Role)) return null;
    return { userId: payload.sub, sessionId: payload.jti, role: payload.role as Role };
  } catch { return null; }
}
