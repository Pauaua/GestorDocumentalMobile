import { type Prisma, Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { AUDIENCE_ROLES } from '../auth/roles';

export interface Audience {
  visibleRoles: readonly Role[];
  recipientIds: readonly string[];
  /** Cursos: los apoderados de sus estudiantes. */
  courseIds?: readonly string[];
}

/**
 * Personas a las que va dirigido un documento: destinatarios directos, miembros activos de los roles
 * con visibilidad y apoderados de los cursos destinatarios. Solo roles de audiencia (docente, apoderado):
 * el equipo directivo ve todo sin aviso.
 * Es la base de las notificaciones y del informe de acuses de recibo.
 */
export function audienceWhere(schoolId: string, audience: Audience): Prisma.MembershipWhereInput {
  const roles = audience.visibleRoles.filter((r) => AUDIENCE_ROLES.includes(r));
  const or: Prisma.MembershipWhereInput[] = [];
  if (roles.length > 0) or.push({ role: { in: [...roles] } });
  if (audience.recipientIds.length > 0) or.push({ userId: { in: [...audience.recipientIds] } });
  if (audience.courseIds?.length) {
    or.push({
      role: Role.apoderado,
      user: { students: { some: { student: { schoolId, courseId: { in: [...audience.courseIds] } } } } },
    });
  }
  if (or.length === 0) return { userId: { in: [] } };
  return { schoolId, isActive: true, user: { isActive: true }, OR: or };
}

export async function audienceUserIds(schoolId: string, audience: Audience): Promise<string[]> {
  const members = await getPrisma().membership.findMany({
    where: audienceWhere(schoolId, audience),
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
