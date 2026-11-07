import { db } from "@/lib/prisma";
import TeacherWorkspace, { type TeacherGroupData } from "@/components/teacher/teacher-workspace";
import { requireUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherSpacePage() {
  const teacher = await requireUser("TEACHER");
  const groups = await db().subjectGroup.findMany({
    where: { teacherId: teacher.id },
    select: {
      id: true,
      name: true,
      level: { select: { id: true, name: true } },
      _count: { select: { enrollments: true, resources: true } },
      enrollments: {
        select: {
          student: { select: { id: true, fullName: true, codeId: true } },
        },
        orderBy: { student: { fullName: "asc" } },
      },
      resources: {
        where: { teacherId: teacher.id },
        select: {
          id: true,
          title: true,
          type: true,
          fileUrl: true,
          externalLink: true,
          examAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ level: { name: "asc" } }, { name: "asc" }],
  });

  const groupData: TeacherGroupData[] = groups.map(group => ({
    id: group.id,
    name: group.name,
    levelId: group.level.id,
    levelName: group.level.name,
    students: group.enrollments.map(({ student }) => student),
    resources: group.resources.map(resource => ({
      ...resource,
      createdAt: resource.createdAt.toISOString(),
      examAt: resource.examAt?.toISOString() ?? null,
    })),
  }));
  const studentCount = new Set(groups.flatMap(group => group.enrollments.map(({ student }) => student.id))).size;

  return <TeacherWorkspace name={teacher.fullName} groups={groupData} studentCount={studentCount} />;
}
