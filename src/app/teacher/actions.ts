"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { deletePrivateObject } from "@/lib/storage/supabase";

export type ResourceActionState = { error?: string; success?: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function textValue(formData: FormData, key: string, maxLength: number): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function parseResource(formData: FormData) {
  const groupId = textValue(formData, "groupId", 36);
  const title = textValue(formData, "title", 200);
  const typeValue = textValue(formData, "type", 20);
  const externalUrl = textValue(formData, "externalUrl", 2048);
  const examDateValue = textValue(formData, "examDate", 30);

  if (!groupId || !isUuid(groupId)) return { error: "Groupe invalide." } as const;
  if (!title) return { error: "Le titre est obligatoire (200 caractères maximum)." } as const;
  if (typeValue !== "COURSE" && typeValue !== "EXERCISE" && typeValue !== "EXAM") {
    return { error: "Choisissez un type de ressource valide." } as const;
  }
  if (externalUrl) {
    try {
      const url = new URL(externalUrl);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
        return { error: "Le lien doit être une adresse HTTP ou HTTPS valide." } as const;
      }
    } catch {
      return { error: "Le lien externe est invalide." } as const;
    }
  }

  let examAt: Date | null = null;
  if (typeValue === "EXAM") {
    if (!examDateValue) return { error: "Choisissez la date et l’heure du devoir surveillé." } as const;
    examAt = new Date(examDateValue);
    if (Number.isNaN(examAt.getTime())) return { error: "La date du devoir surveillé est invalide." } as const;
  } else if (examDateValue) {
    return { error: "La date de devoir surveillé ne s’applique qu’au type EXAM." } as const;
  }

  return {
    groupId,
    title,
    type: typeValue,
    externalUrl,
    examAt,
  } as const;
}

export async function createExternalResource(
  _previous: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  const teacher = await requireUser("TEACHER");
  const parsed = parseResource(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.externalUrl) return { error: "Saisissez un lien externe ou utilisez le formulaire d’envoi PDF." };

  const group = await db().subjectGroup.findFirst({
    where: { id: parsed.groupId, teacherId: teacher.id },
    select: { id: true },
  });
  if (!group) return { error: "Ce groupe n’est pas dans votre espace enseignant." };

  await db().resource.create({
    data: {
      title: parsed.title,
      type: parsed.type,
      externalLink: parsed.externalUrl,
      examAt: parsed.examAt,
      groupId: group.id,
      teacherId: teacher.id,
    },
  });

  revalidatePath("/teacher/space");
  return { success: "La ressource a été ajoutée au groupe." };
}

export async function deleteTeacherResource(resourceId: string): Promise<ResourceActionState> {
  const teacher = await requireUser("TEACHER");
  if (!isUuid(resourceId)) return { error: "Ressource invalide." };

  const resource = await db().resource.findFirst({
    where: { id: resourceId, teacherId: teacher.id, group: { teacherId: teacher.id } },
    select: { id: true, fileUrl: true },
  });
  if (!resource) return { error: "Ressource introuvable ou non autorisée." };

  await db().resource.delete({ where: { id: resource.id } });
  revalidatePath("/teacher/space");
  if (resource.fileUrl) {
    try {
      await deletePrivateObject(resource.fileUrl);
    } catch (error) {
      console.error("Resource was removed from the database, but its private PDF could not be deleted", error);
      return {
        success: "La ressource a été retirée de la liste.",
        error: "Le PDF privé n’a pas pu être supprimé du stockage. Contactez l’administration pour son nettoyage.",
      };
    }
  }
  return { success: "La ressource a été supprimée." };
}
