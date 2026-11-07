import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import StudentSubject, { type StudentSubjectData } from "@/components/student/student-subject";

export const dynamic = "force-dynamic";

export default async function StudentSubjectPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requireUser("STUDENT");
  const { groupId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(groupId)) notFound();

  const enrollment = await db().enrollment.findFirst({
    where: { studentId: user.id, groupId },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          level: { select: { name: true } },
          resources: {
            select: { id: true, title: true, type: true, fileUrl: true, externalLink: true, examAt: true, createdAt: true },
            orderBy: [{ type: "asc" }, { createdAt: "desc" }],
          },
        },
      },
    },
  });
  if (!enrollment) notFound();

  const data: StudentSubjectData = {
    groupId,
    groupName: enrollment.group.name,
    levelName: enrollment.group.level.name,
    resources: enrollment.group.resources.map(resource => ({
      ...resource,
      createdAt: resource.createdAt.toISOString(),
      examAt: resource.examAt?.toISOString() ?? null,
    })),
  };
  return <StudentSubject data={data} />;
}
