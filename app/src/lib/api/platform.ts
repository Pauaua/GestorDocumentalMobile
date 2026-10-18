import { create as createHttp } from 'axios';
import { create } from 'zustand';
import { API_BASE } from '../config';

/**
 * Consola de RTLCO (superadmin). Sesión separada de la del colegio y solo en memoria: el token dura
 * 15 minutos y no se renueva (uso ocasional y de alto privilegio). Recomendado: abrirla en admin.rtlco.cl.
 */
interface PlatformSessionState {
  token: string | null;
  name: string | null;
  setSession: (token: string, name: string) => void;
  clear: () => void;
}

export const usePlatformSession = create<PlatformSessionState>((set) => ({
  token: null,
  name: null,
  setSession: (token, name) => set({ token, name }),
  clear: () => set({ token: null, name: null }),
}));

const http = createHttp({ baseURL: API_BASE, timeout: 20_000 });

http.interceptors.request.use((config) => {
  const token = usePlatformSession.getState().token;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

http.interceptors.response.use(undefined, (error: { response?: { status?: number } }) => {
  if (error.response?.status === 401) usePlatformSession.getState().clear();
  throw error;
});

export type Plan = 'basico' | 'estandar' | 'red';

export interface PlatformSchool {
  id: string;
  slug: string;
  name: string;
  rbd: string | null;
  plan: Plan;
  primaryColor: string | null;
  isActive: boolean;
  createdAt: string;
  organization: { id: string; name: string } | null;
  _count: { memberships: number; documents: number };
}

export interface PlatformOrganization {
  id: string;
  name: string;
  rut: string | null;
  schools: { id: string; slug: string; name: string; isActive: boolean }[];
  admins: { user: { id: string; fullName: string; email: string } }[];
}

export interface AccountInput {
  fullName: string;
  rut: string;
  email: string;
  password?: string;
}

export const platformApi = {
  login: async (email: string, password: string) => {
    const { data } = await http.post<{ user: { fullName: string }; accessToken: string }>('/auth/platform/login', { email, password });
    usePlatformSession.getState().setSession(data.accessToken, data.user.fullName);
  },
  schools: () => http.get<PlatformSchool[]>('/platform/schools').then((r) => r.data),
  createSchool: (input: { slug: string; name: string; rbd?: string | null; plan: Plan; organizationId?: string | null; director: AccountInput }) =>
    http.post<PlatformSchool & { director: { invitationSent: boolean } }>('/platform/schools', input).then((r) => r.data),
  updateSchool: (id: string, input: Partial<{ name: string; plan: Plan; isActive: boolean; organizationId: string | null }>) =>
    http.patch<PlatformSchool>(`/platform/schools/${id}`, input).then((r) => r.data),
  organizations: () => http.get<PlatformOrganization[]>('/platform/organizations').then((r) => r.data),
  createOrganization: (input: { name: string; rut?: string | null }) =>
    http.post<PlatformOrganization>('/platform/organizations', input).then((r) => r.data),
  addOrganizationAdmin: (id: string, input: AccountInput) =>
    http.post(`/platform/organizations/${id}/admins`, input).then((r) => r.data),
};

export const PLAN_LABELS: Record<Plan, string> = { basico: 'Básico', estandar: 'Estándar', red: 'Red' };
