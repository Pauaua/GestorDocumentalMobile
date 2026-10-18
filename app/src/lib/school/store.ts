import { Platform } from 'react-native';
import { create } from 'zustand';
import { BASE_DOMAIN, DEFAULT_SCHOOL } from '../config';
import { clearStoredSchool, getStoredSchool, setStoredSchool } from './school-storage';

/** Mismo formato que valida la API. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** Subdominios que no son colegios (app.rtlco.cl, admin.rtlco.cl...), igual que en la API. */
const RESERVED = new Set(['app', 'api', 'www', 'admin', 'plataforma', 'platform', 'static', 'mail', 'status']);

/** Web: demo.rtlco.cl (o demo.localhost en desarrollo) → "demo". */
function slugFromLocation(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  for (const suffix of [BASE_DOMAIN, 'localhost'].filter(Boolean) as string[]) {
    if (host.endsWith(`.${suffix}`)) {
      const label = host.slice(0, -(suffix.length + 1));
      return label.includes('.') || RESERVED.has(label) ? null : label;
    }
  }
  return null;
}

interface SchoolState {
  /** Colegio al que se dirigen las solicitudes (header X-School). */
  slug: string | null;
  /** true si viene del subdominio: no se puede cambiar desde la app. */
  fixed: boolean;
  setSlug: (slug: string) => Promise<void>;
  clearSlug: () => Promise<void>;
}

export const useSchool = create<SchoolState>((set, get) => ({
  slug: null,
  fixed: false,
  setSlug: async (slug) => {
    if (get().fixed) return;
    await setStoredSchool(slug);
    set({ slug });
  },
  clearSlug: async () => {
    if (get().fixed) return;
    await clearStoredSchool();
    set({ slug: null });
  },
}));

/** Determina el colegio al abrir la app: subdominio → colegio recordado → EXPO_PUBLIC_SCHOOL. */
export async function initSchool(): Promise<void> {
  const fromHost = slugFromLocation();
  if (fromHost) {
    useSchool.setState({ slug: fromHost, fixed: true });
    return;
  }
  const stored = await getStoredSchool().catch(() => null);
  useSchool.setState({ slug: stored ?? DEFAULT_SCHOOL ?? null, fixed: false });
}

/**
 * URL para entrar a otro colegio. En la web con dominio propio cada colegio vive en su subdominio;
 * en la app (o en desarrollo) se cambia el colegio guardado y se vuelve a iniciar sesión.
 */
export function schoolUrl(slug: string): string | null {
  if (Platform.OS !== 'web' || !BASE_DOMAIN || typeof window === 'undefined') return null;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${slug}.${BASE_DOMAIN}${port}`;
}
