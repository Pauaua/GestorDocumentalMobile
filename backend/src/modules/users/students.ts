import type { Prisma } from '@prisma/client';

/** Estudiante resumido: el curso se expone por nombre (y su id para usarlo como audiencia). */
export const studentSummarySelect = {
  id: true,
  fullName: true,
  course: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSummarySelect }>;

export const toStudentSummary = ({ course, ...s }: StudentRow) => ({ ...s, course: course.name, courseId: course.id });
