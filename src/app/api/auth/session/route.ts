import { NextRequest } from "next/server";
import { authorizeApi, json } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const result = await authorizeApi(request);
    if (!result.ok) return result.response;
    const { id, fullName, codeId, role } = result.user;
    return json({ user: { id, fullName, codeId, role } });
  } catch { return json({ message: "Service temporairement indisponible." }, 503); }
}
