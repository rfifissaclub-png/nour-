export const ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];
export const HOME: Record<Role, string> = {
  ADMIN: "/admin/dashboard", TEACHER: "/teacher/space", STUDENT: "/student/home",
};
export const BLOCKED_MESSAGE = "Votre compte est temporairement suspendu. Merci de contacter l’administration du centre NOUR pour réactiver votre accès.";
export const SESSION_SECONDS = 8 * 60 * 60;
export const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-nour_session" : "nour_session";
export const COOKIE_OPTIONS = {
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/",
};
export function pathRole(path: string): Role | null {
  for (const role of ROLES) {
    const prefix = `/${role.toLowerCase()}`;
    const apiPrefix = `/api/${role.toLowerCase()}`;
    if (path === prefix || path.startsWith(prefix + "/") || path === apiPrefix || path.startsWith(apiPrefix + "/")) return role;
  }
  return null;
}
