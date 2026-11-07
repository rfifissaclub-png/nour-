import { requireUser } from "@/lib/auth/guards";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser("TEACHER");
  return children;
}
