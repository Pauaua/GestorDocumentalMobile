import { Platform } from 'react-native';

/**
 * URL base de la API.
 * - Producción: https://<dominio> (EXPO_PUBLIC_API_URL).
 * - Web servida por Express en EC2: si no se define, usa el mismo origen de la página.
 * - Desarrollo en el teléfono: la IP local del PC, p. ej. http://192.168.1.20:3000.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();
export const API_BASE = `${API_URL}/api/v1`;

export const APP_NAME = 'RTLCO';

/** Dominio de los colegios: <slug>.EXPO_PUBLIC_BASE_DOMAIN (p. ej. demo.rtlco.cl). */
export const BASE_DOMAIN = process.env.EXPO_PUBLIC_BASE_DOMAIN?.trim().toLowerCase() || undefined;
/** Colegio por defecto en desarrollo (p. ej. demo), para no escribir el código en cada prueba. */
export const DEFAULT_SCHOOL = process.env.EXPO_PUBLIC_SCHOOL?.trim().toLowerCase() || undefined;

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const;
