import argon2 from "argon2";
import { randomBytes } from "node:crypto";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export function isValidAdminPassword(password: string): boolean {
  return password.length >= MIN_ADMIN_PASSWORD_LENGTH && password.length <= MAX_ADMIN_PASSWORD_LENGTH;
}

export async function hashAdminPassword(password: string): Promise<string> {
  if (!isValidAdminPassword(password)) {
    throw new Error(`Administrator password must contain ${MIN_ADMIN_PASSWORD_LENGTH}-${MAX_ADMIN_PASSWORD_LENGTH} characters`);
  }
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

let dummy: Promise<string> | undefined;

export async function verifyAdminPassword(hash: string | undefined, password: string): Promise<boolean> {
  dummy ??= hashAdminPassword(randomBytes(32).toString("base64url"));
  const validHash = hash?.startsWith("$argon2id$") === true;
  const target = validHash ? hash : await dummy;
  const candidate = password.length <= MAX_ADMIN_PASSWORD_LENGTH ? password : "invalid-password-input";
  try {
    const matches = await argon2.verify(target, candidate);
    return validHash && isValidAdminPassword(password) && matches;
  } catch {
    return false;
  }
}
