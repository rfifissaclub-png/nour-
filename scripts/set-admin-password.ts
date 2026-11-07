import "dotenv/config";
import { db } from "../src/lib/prisma";
import { normalizeIdentity } from "../src/lib/auth/identity";
import { hashAdminPassword } from "../src/lib/auth/password";

async function main() {
  const code = normalizeIdentity(process.env.ACCOUNT_CODE);
  const password = process.env.ACCOUNT_PASSWORD ?? "";
  if (!code || code.kind !== "code") throw new Error("ACCOUNT_CODE must be a valid NOUR Code ID");
  const passwordHash = await hashAdminPassword(password);
  const admin = await db().user.findFirst({ where: { codeId: code.value, role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("No administrator exists with that Code ID");
  await db().$transaction([
    db().user.update({ where: { id: admin.id }, data: { passwordHash } }),
    db().authSession.deleteMany({ where: { userId: admin.id } }),
  ]);
  console.log("Mot de passe administrateur mis à jour; les sessions existantes ont été révoquées.");
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Erreur");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db().$disconnect();
  });
