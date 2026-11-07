import { requireUser } from "@/lib/auth/guards";
import BackupDashboard from "@/components/admin/backup-dashboard";
export default async function Page() {
  const user = await requireUser("ADMIN");
  return <BackupDashboard name={user.fullName} codeId={user.codeId} />;
}
