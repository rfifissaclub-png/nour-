import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "./session";
import { COOKIE_NAME, HOME, type Role } from "./constants";
export async function requireUser(role?: Role) {
  const session = await readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (session.status === "blocked") redirect("/login?reason=blocked");
  if (session.status !== "authenticated") redirect("/login");
  if (role && session.user.role !== role) redirect(HOME[session.user.role]);
  return session.user;
}
