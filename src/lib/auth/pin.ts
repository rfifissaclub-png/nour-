import argon2 from "argon2";
import { randomBytes } from "node:crypto";
export async function hashPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must contain exactly four digits");
  return argon2.hash(pin, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
let dummy: Promise<string> | undefined;
export async function verifyPin(hash: string | undefined, pin: string) {
  dummy ??= hashPin(String(randomBytes(4).readUInt32BE() % 10000).padStart(4, "0"));
  const target = hash?.startsWith("$argon2id$") ? hash : await dummy;
  try { return await argon2.verify(target, pin) && Boolean(hash?.startsWith("$argon2id$")); }
  catch { return false; }
}
