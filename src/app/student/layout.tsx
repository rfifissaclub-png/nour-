import { requireUser } from "@/lib/auth/guards";
import StudentShell from "@/components/student/student-shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser("STUDENT");
  return <StudentShell>{children}</StudentShell>;
}
