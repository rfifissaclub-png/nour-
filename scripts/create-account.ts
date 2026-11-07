import "dotenv/config";
import { db } from "../src/lib/prisma";
import { hashPin } from "../src/lib/auth/pin";
import { hashAdminPassword } from "../src/lib/auth/password";
import { normalizeIdentity, normalizePhone, latinDigits } from "../src/lib/auth/identity";
import { ROLES, type Role } from "../src/lib/auth/constants";
import { randomInt } from "node:crypto";
async function main() {
  const code = normalizeIdentity(process.env.ACCOUNT_CODE);
  const name = process.env.ACCOUNT_NAME?.trim();
  const role = process.env.ACCOUNT_ROLE as Role;
  const pin = latinDigits(process.env.ACCOUNT_PIN ?? "");
  const password = process.env.ACCOUNT_PASSWORD ?? "";
  const phone = process.env.ACCOUNT_PHONE ? normalizePhone(process.env.ACCOUNT_PHONE) : null;
  if (!code || code.kind !== "code" || !name || name.length > 150 || !ROLES.includes(role) || (process.env.ACCOUNT_PHONE && !phone)) {
    throw new Error("Invalid ACCOUNT_CODE, ACCOUNT_NAME, ACCOUNT_ROLE or ACCOUNT_PHONE");
  }
  if (role === "ADMIN" && process.env.ACCOUNT_PIN) throw new Error("Use ACCOUNT_PASSWORD, not ACCOUNT_PIN, for administrator accounts");
  if (role !== "ADMIN" && (!/^\d{4}$/.test(pin) || password)) throw new Error("Use a four-digit ACCOUNT_PIN for student/teacher accounts and do not set ACCOUNT_PASSWORD");
  const passwordHash = role === "ADMIN" ? await hashAdminPassword(password) : null;
  const pinHash = await hashPin(role === "ADMIN" ? String(randomInt(0, 10000)).padStart(4, "0") : pin);
  await db().user.create({ data: { codeId: code.value, fullName: name, role, pin: pinHash, passwordHash, phone } });
  console.log("Compte créé. Aucun PIN ou mot de passe n’a été affiché ni journalisé.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Erreur"); process.exitCode = 1; }).finally(async () => { await db().$disconnect(); });
