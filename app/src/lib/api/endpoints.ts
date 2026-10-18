import { api } from './client';
import type {
  AppNotification,
  AuditEvent,
  Course,
  DocumentFilters,
  DocumentInput,
  DocumentItem,
  DocumentStats,
  DocumentStatus,
  DocumentType,
  DownloadLogEntry,
  DownloadUrlResponse,
  ImportKind,
  ImportResult,
  Member,
  Paginated,
  Receipt,
  ReceiptReport,
  Role,
  SchoolInfo,
  SessionResponse,
  UploadUrlResponse,
  User,
} from '../types';

export const schoolApi = {
  /** Datos públicos de un colegio; slug explícito para validar el código antes de guardarlo. */
  get: (slug?: string) =>
    api.get<SchoolInfo>('/school', slug ? { headers: { 'X-School': slug } } : undefined).then((r) => r.data),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<SessionResponse>('/auth/login', { email, password }).then((r) => r.data),
  logout: (refreshToken?: string | null) =>
    api.post('/auth/logout', refreshToken ? { refreshToken } : {}).then(() => undefined),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  forgotPassword: (email: string) => api.post('/auth/password/forgot', { email }).then(() => undefined),
  passwordToken: (token: string) =>
    api
      .get<{ purpose: 'reset' | 'invite'; fullName: string; email: string }>('/auth/password/token', { params: { token } })
      .then((r) => r.data),
  resetPassword: (token: string, password: string) =>
    api.post<{ purpose: 'reset' | 'invite' }>('/auth/password/reset', { token, password }).then((r) => r.data),
};

export const coursesApi = {
  list: () => api.get<Course[]>('/courses').then((r) => r.data),
};

export const importsApi = {
  /** dryRun=true: vista previa sin escribir; false: importa todo o nada. */
  run: (kind: ImportKind, csv: string, opts: { dryRun: boolean; invite: boolean }) =>
    api
      .post<ImportResult>(`/imports/${kind}`, csv, {
        params: { dryRun: String(opts.dryRun), invite: String(opts.invite) },
        headers: { 'Content-Type': 'text/csv' },
        timeout: 130_000,
      })
      .then((r) => r.data),
  template: (kind: ImportKind) =>
    api.get<string>(`/imports/${kind}/template`, { responseType: 'text' }).then((r) => r.data),
};

export interface AuditParams {
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const auditApi = {
  list: (params: AuditParams) => api.get<Paginated<AuditEvent>>('/audit', { params }).then((r) => r.data),
};

export const privacyApi = {
  /** JSON con los datos de la persona (acceso y portabilidad, Ley 21.719). */
  export: () => api.get<unknown>('/privacy/export').then((r) => r.data),
};

export const documentsApi = {
  list: (filters: DocumentFilters, page: number, pageSize = 15) =>
    api
      .get<Paginated<DocumentItem>>('/documents', { params: { ...filters, page, pageSize } })
      .then((r) => r.data),
  get: (id: string) => api.get<DocumentItem>(`/documents/${id}`).then((r) => r.data),
  stats: () => api.get<DocumentStats>('/documents/stats').then((r) => r.data),
  uploadUrl: (file: { fileName: string; mimeType: string; fileSize: number }) =>
    api.post<UploadUrlResponse>('/documents/upload-url', file).then((r) => r.data),
  create: (input: DocumentInput & { s3Key: string; fileName: string; mimeType: string; fileSize: number }) =>
    api.post<DocumentItem>('/documents', input).then((r) => r.data),
  update: (id: string, input: Partial<DocumentInput> & { status?: DocumentStatus }) =>
    api.patch<DocumentItem>(`/documents/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/documents/${id}`).then(() => undefined),
  downloadUrl: (id: string, disposition: 'attachment' | 'inline' = 'attachment') =>
    api.get<DownloadUrlResponse>(`/documents/${id}/download-url`, { params: { disposition } }).then((r) => r.data),
  downloads: (id: string) => api.get<DownloadLogEntry[]>(`/documents/${id}/downloads`).then((r) => r.data),
  acknowledge: (id: string) => api.post<Receipt>(`/documents/${id}/acknowledge`).then((r) => r.data),
  receipts: (id: string) => api.get<ReceiptReport>(`/documents/${id}/receipts`).then((r) => r.data),
};

export const notificationsApi = {
  list: (page = 1, pageSize = 30) =>
    api
      .get<Paginated<AppNotification> & { unread: number }>('/notifications', { params: { page, pageSize } })
      .then((r) => r.data),
  read: (id: string) => api.post(`/notifications/${id}/read`).then(() => undefined),
  readAll: () => api.post<{ updated: number }>('/notifications/read-all').then((r) => r.data),
  preferences: () => api.get<{ emailNotifications: boolean }>('/notifications/preferences').then((r) => r.data),
  updatePreferences: (input: { emailNotifications: boolean }) =>
    api.patch<{ emailNotifications: boolean }>('/notifications/preferences', input).then((r) => r.data),
  registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') =>
    api.post('/notifications/push-tokens', { token, platform }).then(() => undefined),
  unregisterPushToken: (token: string) =>
    api.delete(`/notifications/push-tokens/${encodeURIComponent(token)}`).then(() => undefined),
};

export const catalogApi = {
  documentTypes: () => api.get<DocumentType[]>('/document-types').then((r) => r.data),
};

export interface UserListParams {
  role?: Role;
  q?: string;
  isActive?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  fullName: string;
  rut: string;
  email: string;
  /** Sin contraseña la persona recibe una invitación por correo. */
  password?: string;
  role: Role;
  phone?: string | null;
}

export const usersApi = {
  list: (params: UserListParams) => api.get<Paginated<Member>>('/users', { params }).then((r) => r.data),
  create: (input: CreateUserInput) => api.post<Member>('/users', input).then((r) => r.data),
  update: (id: string, input: Partial<Omit<CreateUserInput, 'rut'>> & { isActive?: boolean }) =>
    api.patch<Member>(`/users/${id}`, input).then((r) => r.data),
  invite: (id: string) => api.post(`/users/${id}/invite`).then(() => undefined),
};
