import { AxiosError, create, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { API_BASE } from '../config';
import { useSchool } from '../school/store';
import { useSession } from '../session/store';
import { clearRefreshToken, getRefreshToken, setRefreshToken, usesRefreshCookie } from '../session/token-storage';
import type { ApiErrorBody, SessionResponse } from '../types';

const platformHeaders: Record<string, string> = Platform.OS === 'web' ? {} : { 'X-Client-Platform': 'native' };

// Instancia sin interceptores para /auth/refresh (evita recursión ante un 401).
const bare = create({ baseURL: API_BASE, withCredentials: usesRefreshCookie, headers: platformHeaders, timeout: 15_000 });

export const api = create({
  baseURL: API_BASE,
  timeout: 20_000,
  // Web: envía la cookie httpOnly del refresh token (mismo sitio).
  withCredentials: usesRefreshCookie,
  headers: platformHeaders,
});

/** Colegio de la solicitud. En la web con subdominio el servidor usa el host, y el header coincide. */
function withSchool(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const slug = useSchool.getState().slug;
  if (slug && !config.headers.has('X-School')) config.headers.set('X-School', slug);
  return config;
}
bare.interceptors.request.use(withSchool);

// Interceptor de salida: agrega el colegio y el JWT de acceso.
api.interceptors.request.use((config) => {
  const token = useSession.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return withSchool(config);
});

let refreshing: Promise<string | null> | null = null;

/** Renueva la sesión una sola vez aunque fallen varias solicitudes en paralelo. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const stored = await getRefreshToken();
      if (!usesRefreshCookie && !stored) return null;
      const { data } = await bare.post<SessionResponse>('/auth/refresh', usesRefreshCookie ? {} : { refreshToken: stored });
      if (data.refreshToken) await setRefreshToken(data.refreshToken);
      useSession.getState().setSession(data.user, data.accessToken);
      return data.accessToken;
    } catch (err) {
      // Solo un 401 invalida la sesión; un corte de red no debe cerrar sesión.
      if (err instanceof AxiosError && err.response?.status === 401) await clearRefreshToken();
      if (err instanceof AxiosError && !err.response) throw err;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Interceptor de entrada: ante un 401 intenta renovar el access token y reintenta una vez.
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || error.response?.status !== 401 || !error.config) throw error;
  const config = error.config as RetriableConfig;
  if (config._retried || config.url?.startsWith('/auth/')) throw error;
  config._retried = true;
  const token = await refreshSession().catch(() => null);
  if (!token) {
    useSession.getState().clear();
    throw error;
  }
  config.headers.set('Authorization', `Bearer ${token}`);
  return api.request(config as AxiosRequestConfig);
});

/** Mensaje amable en español a partir de un error de Axios. */
export function errorMessage(error: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (error instanceof AxiosError) {
    if (!error.response) return 'No pudimos conectarnos con el servidor. Revisa tu conexión.';
    const body = error.response.data as ApiErrorBody | undefined;
    const detail = body?.error?.details?.[0]?.message;
    if (error.response.status === 403) return body?.error?.message ?? 'No tienes permiso para realizar esta acción';
    if (error.response.status === 429) return 'Demasiados intentos. Espera unos minutos.';
    return detail ?? body?.error?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
