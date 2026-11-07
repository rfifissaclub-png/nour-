import { requireUser } from "@/lib/auth/guards";
import AdminShell from "@/components/admin/admin-shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("ADMIN");
  return <AdminShell name={user.fullName}>{children}</AdminShell>;
}
