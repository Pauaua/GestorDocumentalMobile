import { DocumentStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../../middleware/auth';
import { isAdmin, isManagement } from '../auth/roles';

/**
 * Reglas de visibilidad (se aplican siempre en el servidor, nunca solo en la interfaz):
 * - siempre dentro del colegio de la sesión (aislamiento entre tenants).
 * - director, sostenedor y equipo_directivo: ven todos los documentos no eliminados.
 * - docente y apoderado: solo documentos VIGENTES que tengan su rol en la visibilidad
 *   o donde figuren como destinatarios específicos.
 * - apoderado: además, los dirigidos a un curso de alguno de sus estudiantes.
 */
export function visibleDocumentsWhere(user: AuthUser): Prisma.DocumentWhereInput {
  if (isManagement(user.role)) return { schoolId: user.schoolId, isDeleted: false };
  const or: Prisma.DocumentWhereInput[] = [
    { visibility: { some: { role: user.role } } },
    { recipients: { some: { userId: user.id } } },
  ];
  if (user.role === Role.apoderado) {
    or.push({ courses: { some: { course: { students: { some: { guardians: { some: { guardianId: user.id } } } } } } } });
  }
  return { schoolId: user.schoolId, isDeleted: false, status: DocumentStatus.VIGENTE, OR: or };
}

/** Editar metadatos y archivar: director y sostenedor siempre; equipo directivo solo sus documentos. */
export function canEditDocument(user: AuthUser, doc: { authorId: string }): boolean {
  if (isAdmin(user.role)) return true;
  return user.role === Role.equipo_directivo && doc.authorId === user.id;
}

export function canDeleteDocument(user: AuthUser): boolean {
  return isAdmin(user.role);
}

export function canSeeAudience(user: AuthUser): boolean {
  return isManagement(user.role);
}
