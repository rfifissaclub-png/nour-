import "server-only";
import { db } from "@/lib/prisma";

export async function getStudentResourceAccess(resourceId: string, studentId: string) {
  return db().resource.findFirst({
    where: {
      id: resourceId,
      group: {
        enrollments: { some: { studentId } },
      },
    },
    select: { fileUrl: true },
  });
}
