"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/identity";
import { hashPin } from "@/lib/auth/pin";
import { createStudentQrToken } from "@/lib/access/qr";
import { requireUser } from "@/lib/auth/guards";
import { enqueueBackupEvent } from "@/lib/backup/events";

export type FormActionState = { error?: string; success?: string };

export type StudentActionState = FormActionState & {
  credentials?: {
    studentId: string;
    fullName: string;
    phone: string;
    codeId: string;
    pin: string;
    qrToken: string;
    groups: string[];
  };
};

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function formText(formData: FormData, key: string, maxLength: number): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function isValidAmount(value: string, maximum: number): boolean {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= maximum;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export async function createLevel(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser("ADMIN");
  const name = formText(formData, "name", 100);
  if (!name) return { error: "Saisissez un nom de niveau (100 caractères maximum)." };

  try {
    await db().level.create({ data: { name } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "Ce niveau existe déjà." };
    throw error;
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin/students");
  return { success: "Le niveau a été ajouté." };
}

export async function createSubjectGroup(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser("ADMIN");
  const name = formText(formData, "name", 150);
  const levelId = formText(formData, "levelId", 36);
  const teacherId = formText(formData, "teacherId", 36);
  const teacherPercentage = formText(formData, "teacherPercentage", 6);

  if (!name || !levelId || !teacherId || !teacherPercentage) {
    return { error: "Complétez tous les champs du groupe." };
  }
  if (!isUuid(levelId) || !isUuid(teacherId)) return { error: "Le niveau ou le professeur sélectionné est invalide." };
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(teacherPercentage) || Number(teacherPercentage) > 100) {
    return { error: "La commission du professeur doit être comprise entre 0 et 100 %." };
  }

  const [level, teacher] = await Promise.all([
    db().level.findUnique({ where: { id: levelId }, select: { id: true } }),
    db().user.findFirst({
      where: { id: teacherId, role: "TEACHER", isActive: true },
      select: { id: true },
    }),
  ]);
  if (!level) return { error: "Le niveau sélectionné n’existe plus." };
  if (!teacher) return { error: "Le professeur sélectionné est introuvable ou inactif." };

  try {
    await db().subjectGroup.create({
      data: { name, levelId, teacherId, teacherPercentage },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "Un groupe portant ce nom existe déjà dans ce niveau." };
    throw error;
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin/students");
  return { success: "Le groupe a été ajouté." };
}

export async function createStudent(_previous: StudentActionState, formData: FormData): Promise<StudentActionState> {
  await requireUser("ADMIN");
  const fullName = formText(formData, "fullName", 150);
  const phoneInput = formText(formData, "phone", 80);
  const levelId = formText(formData, "levelId", 36);
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const groupIds = [...new Set(formData.getAll("groupIds").filter((value): value is string => typeof value === "string"))];

  if (!fullName) return { error: "Saisissez le nom complet de l’élève (150 caractères maximum)." };
  if (!phone) return { error: "Saisissez un numéro marocain valide pour l’élève ou son parent." };
  if (!levelId || !isUuid(levelId)) return { error: "Choisissez un niveau valide." };
  if (groupIds.length === 0 || groupIds.length > 30) return { error: "Choisissez au moins une matière." };
  if (groupIds.some(id => !isUuid(id))) return { error: "La sélection de matières est invalide." };
  const enrollmentPrices: Array<{ groupId: string; monthlyPrice: string }> = [];
  for (const groupId of groupIds) {
    const price = formText(formData, `groupPrice_${groupId}`, 12);
    if (!price || !isValidAmount(price, 99999999.99)) {
      return { error: "Saisissez un prix mensuel valide pour chaque matière sélectionnée." };
    }
    enrollmentPrices.push({ groupId, monthlyPrice: price });
  }

  const groups = await db().subjectGroup.findMany({
    where: { id: { in: groupIds }, levelId },
    select: { id: true, name: true },
  });
  if (groups.length !== groupIds.length) {
    return { error: "Une matière sélectionnée n’appartient pas au niveau choisi. Actualisez la page et réessayez." };
  }

  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const hashedPin = await hashPin(pin);
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeId = `NOUR-${String(randomInt(0, 10000)).padStart(4, "0")}`;
    try {
      const student = await db().$transaction(async transaction => {
        const created = await transaction.user.create({
          data: {
            codeId,
            fullName,
            phone,
            pin: hashedPin,
            role: "STUDENT",
            enrollments: { create: enrollmentPrices.map(({ groupId, monthlyPrice }) => ({
              monthlyPrice,
              group: { connect: { id: groupId } },
            })) },
          },
          select: { id: true, qrVersion: true, enrollments: { select: { id: true, groupId: true } } },
        });
        await transaction.backupEvent.createMany({
          data: created.enrollments.map(enrollment => ({
            type: "ENROLLMENT_CREATED",
            entityId: enrollment.id,
            payload: { enrollmentId: enrollment.id, studentId: created.id, groupId: enrollment.groupId },
          })),
        });
        return created;
      });

      revalidatePath("/admin/students");
      revalidatePath("/admin/classes");
      return {
        success: "Le compte élève a été créé. Remettez-lui sa carte d’accès de manière confidentielle.",
        credentials: {
          studentId: student.id,
          fullName,
          phone,
          codeId,
          pin,
          qrToken: createStudentQrToken(codeId, student.qrVersion),
          groups: groups.map(group => group.name),
        },
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }

  }

  return { error: "Impossible de générer un Code ID unique. Réessayez." };
}

export type EnrollmentPriceUpdateResult = { ok: true } | { ok: false; message: string };

export async function updateEnrollmentPrice(
  enrollmentId: string,
  monthlyPrice: string,
): Promise<EnrollmentPriceUpdateResult> {
  await requireUser("ADMIN");
  if (!isUuid(enrollmentId)) return { ok: false, message: "Identifiant d’inscription invalide." };
  if (!isValidAmount(monthlyPrice, 99999999.99)) {
    return { ok: false, message: "Saisissez un prix mensuel valide en MAD." };
  }

  await db().$transaction(async transaction => {
    const enrollment = await transaction.enrollment.update({
      where: { id: enrollmentId },
      data: { monthlyPrice },
      select: { id: true, studentId: true, groupId: true },
    });
    await enqueueBackupEvent(transaction, {
      type: "ENROLLMENT_UPDATED",
      entityId: enrollment.id,
      payload: { enrollmentId: enrollment.id, studentId: enrollment.studentId, groupId: enrollment.groupId },
    });
  });

  revalidatePath("/admin/students");
  revalidatePath("/admin/payments");
  revalidatePath("/student/home");
  revalidatePath("/student/account");
  return { ok: true };
}

export type TeacherActionState = FormActionState & {
  credentials?: {
    teacherId: string;
    fullName: string;
    codeId: string;
    pin: string;
    phone: string;
  };
};

export async function createTeacher(_previous: TeacherActionState, formData: FormData): Promise<TeacherActionState> {
  await requireUser("ADMIN");
  const fullName = formText(formData, "fullName", 150);
  const phoneInput = formText(formData, "phone", 80);
  const phone = phoneInput ? normalizePhone(phoneInput) : null;

  if (!fullName) return { error: "Saisissez le nom complet du professeur." };
  if (!phone) return { error: "Saisissez un numéro marocain valide pour le professeur." };

  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const hashedPin = await hashPin(pin);

  for (let attempt = 0; attempt < 5; attempt++) {
    const codeId = `NOUR-${String(randomInt(0, 10000)).padStart(4, "0")}`;
    try {
      const teacher = await db().user.create({
        data: { codeId, fullName, phone, pin: hashedPin, role: "TEACHER" },
        select: { id: true },
      });
      revalidatePath("/admin/classes");
      revalidatePath("/admin/students");
      return {
        success: "Le compte professeur a été créé. Donnez-lui ses identifiants en privé.",
        credentials: { teacherId: teacher.id, fullName, codeId, pin, phone },
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  return { error: "Impossible de générer un code ID unique. Réessayez." };
}

export async function updateStudentProfile(
  studentId: string,
  values: { fullName?: string; phone?: string | null; active?: boolean },
): Promise<FormActionState> {
  await requireUser("ADMIN");
  if (!isUuid(studentId)) return { error: "Identifiant élève invalide." };

  const fullName = (values.fullName ?? "").trim();
  if (!fullName || fullName.length > 150) {
    return { error: "Le nom de l’élève est obligatoire (150 caractères maximum)." };
  }

  const normalizedPhone = typeof values.phone === "string"
    ? values.phone.trim()
    : values.phone === null
      ? null
      : "";

  const phone = normalizedPhone ? normalizePhone(normalizedPhone) : null;
  if (typeof values.phone === "string" && values.phone.trim() && !phone) {
    return { error: "Le numéro de téléphone est invalide." };
  }

  const student = await db().user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return { error: "Cet élève n’existe plus." };

  await db().user.update({
    where: { id: student.id },
    data: {
      fullName,
      phone,
      isActive: typeof values.active === "boolean" ? values.active : undefined,
    },
  });

  revalidatePath("/admin/students");
  revalidatePath("/admin/payments");
  revalidatePath("/student/home");
  revalidatePath("/student/account");
  return { success: "Le profil de l’élève a été mis à jour." };
}

export type RegeneratedCredentials =
  | { ok: true; pin: string; qrToken: string }
  | { ok: false; message: string };

export async function regenerateStudentPin(studentId: string): Promise<RegeneratedCredentials> {
  await requireUser("ADMIN");
  if (!isUuid(studentId)) return { ok: false, message: "Identifiant élève invalide." };

  const student = await db().user.findFirst({
    where: { id: studentId, role: "STUDENT", isActive: true },
    select: { id: true },
  });
  if (!student) return { ok: false, message: "Cet élève n’existe plus ou son compte est inactif." };

  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const hashedPin = await hashPin(pin);
  const [updated] = await db().$transaction([
    db().user.update({ where: { id: student.id }, data: { pin: hashedPin, qrVersion: { increment: 1 } }, select: { codeId: true, qrVersion: true } }),
    db().authSession.deleteMany({ where: { userId: student.id } }),
  ]);

  revalidatePath("/admin/students");
  return { ok: true, pin, qrToken: createStudentQrToken(updated.codeId, updated.qrVersion) };
}
