import type { Role } from './types';

/**
 * Reglas de la interfaz (solo para mostrar u ocultar opciones).
 * La API vuelve a validar todo: nunca se confía solo en la interfaz.
 */
export const MANAGEMENT_ROLES: readonly Role[] = ['director', 'sostenedor', 'equipo_directivo'];
export const ADMIN_ROLES: readonly Role[] = ['director', 'sostenedor'];
export const AUDIENCE_ROLES: readonly Role[] = ['docente', 'apoderado'];
export const ALL_ROLES: readonly Role[] = ['director', 'sostenedor', 'equipo_directivo', 'docente', 'apoderado'];

export const isManagement = (role: Role | undefined): boolean => !!role && MANAGEMENT_ROLES.includes(role);
export const isAdmin = (role: Role | undefined): boolean => !!role && ADMIN_ROLES.includes(role);
export const canUpload = isManagement;

export const ROLE_LABELS: Record<Role, string> = {
  director: 'Director(a)',
  sostenedor: 'Sostenedor(a)',
  equipo_directivo: 'Equipo directivo',
  docente: 'Docente',
  apoderado: 'Apoderado(a)',
};
