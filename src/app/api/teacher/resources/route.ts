import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/prisma";
import { authorizeApi, json, sameOrigin } from "@/lib/auth/http";
import { deletePrivateObject, uploadPrivatePdf } from "@/lib/storage/supabase";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_MULTIPART_SIZE = 11 * 1024 * 1024;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ message: "Requête non autorisée." }, 403);
  const auth = await authorizeApi(request, "TEACHER");
  if (!auth.ok) return auth.response;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_SIZE) {
    return json({ message: "Le fichier ne doit pas dépasser 10 Mo." }, 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return json({ message: "Format de requête invalide." }, 415);
  }

  const formData = await request.formData();
  const groupId = formData.get("groupId");
  const title = formData.get("title");
  const type = formData.get("type");
  const examDateValue = formData.get("examDate");
  const file = formData.get("file");
  if (typeof groupId !== "string" || !isUuid(groupId) || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
    return json({ message: "Groupe ou titre invalide." }, 400);
  }
  if (type !== "COURSE" && type !== "EXERCISE" && type !== "EXAM") {
    return json({ message: "Type de ressource invalide." }, 400);
  }
  if (!(file instanceof File)) return json({ message: "Choisissez un fichier PDF." }, 400);

  let examAt: Date | null = null;
  if (type === "EXAM") {
    if (typeof examDateValue !== "string" || !examDateValue) return json({ message: "La date du devoir surveillé est obligatoire." }, 400);
    examAt = new Date(examDateValue);
    if (Number.isNaN(examAt.getTime())) return json({ message: "La date du devoir surveillé est invalide." }, 400);
  } else if (examDateValue) {
    return json({ message: "La date de devoir surveillé ne s’applique qu’au type EXAM." }, 400);
  }

  const group = await db().subjectGroup.findFirst({
    where: { id: groupId, teacherId: auth.user.id },
    select: { id: true },
  });
  if (!group) return json({ message: "Ce groupe n’est pas dans votre espace enseignant." }, 403);

  const objectKey = `teachers/${auth.user.id}/${randomUUID()}.pdf`;
  try {
    await uploadPrivatePdf(objectKey, file);
  } catch (error) {
    if (error instanceof Error && (
      error.message === "PDF must be between 1 byte and 10 MB" ||
      error.message === "Only PDF files are allowed" ||
      error.message === "The uploaded file is not a valid PDF"
    )) {
      return json({ message: error.message }, 400);
    }
    console.error("Could not upload teacher PDF to private storage", error);
    return json({ message: "Le stockage PDF est indisponible. Réessayez plus tard ou contactez l’administration." }, 503);
  }
  try {
    const resource = await db().resource.create({
      data: {
        title: title.trim(),
        type,
        fileUrl: objectKey,
        examAt,
        groupId: group.id,
        teacherId: auth.user.id,
      },
      select: { id: true },
    });
    revalidatePath("/teacher/space");
    return json({ id: resource.id, message: "Le PDF a été ajouté." }, 201);
  } catch (error) {
    console.error("Could not save uploaded resource in the database", error);
    try {
      await deletePrivateObject(objectKey);
      return json({ message: "Le PDF a été envoyé, mais son enregistrement a échoué. Le fichier temporaire a été supprimé ; veuillez réessayer." }, 500);
    } catch (cleanupError) {
      console.error("Could not clean up an orphaned private PDF", cleanupError);
      return json({ message: "Le PDF a été envoyé mais son enregistrement a échoué et le fichier temporaire n’a pas pu être supprimé. Contactez l’administration." }, 500);
    }
  }
}
