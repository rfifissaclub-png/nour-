import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { HOME } from "@/lib/auth/constants";
export default async function Page() { const user = await requireUser(); redirect(HOME[user.role]); }
