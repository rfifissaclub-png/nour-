import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { authorizeApi, json } from "@/lib/auth/http";
import { createPrivatePdfSignedUrl } from "@/lib/storage/supabase";
import { getStudentResourceAccess } from "@/lib/resources/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ resourceId: string }> }) {
  const auth = await authorizeApi(request);
  if (!auth.ok) return auth.response;
  const { resourceId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(resourceId)) {
    return json({ message: "Ressource introuvable." }, 404);
  }

  const resource = auth.user.role === "TEACHER"
    ? await db().resource.findFirst({
      where: { id: resourceId, teacherId: auth.user.id, group: { teacherId: auth.user.id } },
      select: { fileUrl: true },
    })
    : auth.user.role === "STUDENT"
      ? await getStudentResourceAccess(resourceId, auth.user.id)
      : null;
  if (!resource?.fileUrl) return json({ message: "PDF introuvable ou accès refusé." }, 404);
  return Response.redirect(await createPrivatePdfSignedUrl(resource.fileUrl), 302);
}
