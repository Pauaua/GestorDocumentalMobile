import { Role } from '@prisma/client';

export { Role };

/** Equipo directivo en sentido amplio: ven todos los documentos. */
export const MANAGEMENT_ROLES: readonly Role[] = [Role.director, Role.sostenedor, Role.equipo_directivo];
/** Pueden subir documentos. */
export const UPLOADER_ROLES: readonly Role[] = MANAGEMENT_ROLES;
/** Pueden eliminar (borrado lógico) y gestionar usuarios. */
export const ADMIN_ROLES: readonly Role[] = [Role.director, Role.sostenedor];
/** Roles que dependen de la visibilidad definida en cada documento. */
export const AUDIENCE_ROLES: readonly Role[] = [Role.docente, Role.apoderado];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

export const ROLE_LABELS: Record<Role, string> = {
  director: 'Director(a)',
  sostenedor: 'Sostenedor(a)',
  equipo_directivo: 'Equipo directivo',
  docente: 'Docente',
  apoderado: 'Apoderado(a)',
};

export const isManagement = (role: Role): boolean => MANAGEMENT_ROLES.includes(role);
export const isAdmin = (role: Role): boolean => ADMIN_ROLES.includes(role);
