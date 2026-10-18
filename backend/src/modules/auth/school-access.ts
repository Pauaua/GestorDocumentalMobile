import { Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import type { Tenant } from '../../middleware/tenant';

/**
 * Rol efectivo de un usuario en un colegio:
 *   - su membresía activa en el colegio, o
 *   - sostenedor, si administra la red (organización) a la que pertenece el colegio.
 * null = no tiene acceso. El superadmin de la plataforma no obtiene acceso a los documentos.
 */
export async function resolveSchoolRole(
  userId: string,
  school: Pick<Tenant, 'id' | 'organizationId'>,
): Promise<Role | null> {
  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_schoolId: { userId, schoolId: school.id } },
    select: { role: true, isActive: true },
  });
  if (membership?.isActive) return membership.role;
  if (school.organizationId) {
    const admin = await prisma.organizationAdmin.findUnique({
      where: { userId_organizationId: { userId, organizationId: school.organizationId } },
      select: { userId: true },
    });
    if (admin) return Role.sostenedor;
  }
  return null;
}

export interface AccessibleSchool {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

/** Colegios a los que el usuario puede entrar (para el selector de colegio). */
export async function accessibleSchools(userId: string): Promise<AccessibleSchool[]> {
  const prisma = getPrisma();
  const [memberships, orgAdmin] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, isActive: true, school: { isActive: true } },
      select: { role: true, school: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.organizationAdmin.findMany({
      where: { userId },
      select: { organization: { select: { schools: { where: { isActive: true }, select: { id: true, slug: true, name: true } } } } },
    }),
  ]);
  const result = new Map<string, AccessibleSchool>();
  for (const m of memberships) result.set(m.school.id, { ...m.school, role: m.role });
  for (const a of orgAdmin) {
    for (const s of a.organization.schools) if (!result.has(s.id)) result.set(s.id, { ...s, role: Role.sostenedor });
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
