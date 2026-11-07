import { createHmac, timingSafeEqual } from "node:crypto";

const CODE_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,31}$/;

function signature(codeId: string, version: number): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("AUTH_SECRET must contain at least 32 random bytes");
  return createHmac("sha256", secret).update(`nour-center/access-qr/v1\0${codeId}\0${version}`).digest();
}

export function createStudentQrToken(codeId: string, version: number): string {
  if (!CODE_ID_PATTERN.test(codeId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("Invalid student QR token claims");
  }
  return `NOUR1.${codeId}.${version}.${signature(codeId, version).toString("base64url")}`;
}

export function verifyStudentQrToken(token: unknown): { codeId: string; version: number } | null {
  if (typeof token !== "string" || token.length > 160) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "NOUR1" || !CODE_ID_PATTERN.test(parts[1])) return null;
  const version = Number(parts[2]);
  if (!Number.isSafeInteger(version) || version < 1 || !/^[1-9]\d*$/.test(parts[2])) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return null;
  const actual = Buffer.from(parts[3], "base64url");
  const expected = signature(parts[1], version);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { codeId: parts[1], version };
}
