/** Tipos de la API REST (/api/v1). Reflejan las respuestas del backend. */

export type Role = 'director' | 'sostenedor' | 'equipo_directivo' | 'docente' | 'apoderado';
export type DocumentStatus = 'VIGENTE' | 'ARCHIVADO';

export interface StudentSummary {
  id: string;
  fullName: string;
  course: string;
  courseId?: string;
}

export interface Course {
  id: string;
  name: string;
  students: number;
}

/** Datos públicos del colegio (GET /school). */
export interface SchoolInfo {
  slug: string;
  name: string;
  primaryColor: string | null;
}

export interface SessionSchool extends SchoolInfo {
  id: string;
}

/** Colegio al que el usuario puede entrar, con su rol en él. */
export interface AccessibleSchool {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

export interface User {
  id: string;
  fullName: string;
  rut: string;
  email: string;
  /** Rol en el colegio de la sesión. */
  role: Role;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  school: SessionSchool;
  students?: StudentSummary[];
  /** Solo en /auth/me. */
  schools?: AccessibleSchool[];
}

/** Miembro del colegio (GET /users). */
export type Member = Omit<User, 'school' | 'schools'> & { existingAccount?: boolean; invitationSent?: boolean };

export type ImportKind = 'people' | 'students';

export interface ImportResult {
  kind: ImportKind;
  dryRun: boolean;
  summary: {
    rows: number;
    valid: number;
    errors: number;
    accountsCreated: number;
    addedToSchool: number;
    invitations: number;
    studentsCreated?: number;
    coursesCreated?: number;
  };
  rows: { line: number; status: 'ok' | 'error'; actions: string[]; errors: string[] }[];
}

export interface AuditEvent {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { id: string; fullName: string | null } | null;
}

export interface UserSummary {
  id: string;
  fullName: string;
  role: Role;
}

export interface DocumentType {
  id: number;
  code: string;
  name: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  description: string | null;
  documentType: DocumentType;
  folioNumber: string | null;
  documentDate: string;
  author: UserSummary;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  /** La audiencia debe confirmar la recepción (p. ej. citaciones). */
  requiresAcknowledgement: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: { canEdit: boolean; canDelete: boolean; canViewDownloads: boolean; canAcknowledge: boolean };
  /** Solo para la audiencia: su propio acuse de recibo. */
  myReceipt?: Receipt | null;
  /** Solo para el equipo directivo. */
  visibleRoles?: Role[];
  recipients?: UserSummary[];
  courses?: { id: string; name: string }[];
}

export interface Receipt {
  viewedAt: string;
  acknowledgedAt: string | null;
}

/** Informe de acuses (equipo directivo). */
export interface ReceiptReport {
  requiresAcknowledgement: boolean;
  summary: { audience: number; viewed: number; acknowledged: number };
  items: {
    user: UserSummary;
    inAudience: boolean;
    viewedAt: string | null;
    acknowledgedAt: string | null;
    ip: string | null;
  }[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  documentId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface DocumentFilters {
  q?: string;
  typeId?: number;
  status?: DocumentStatus;
  dateFrom?: string;
  dateTo?: string;
  authorId?: string;
}

export interface DocumentStats {
  total: number;
  byType: (DocumentType & { count: number })[];
}

export interface DownloadLogEntry {
  id: string;
  downloadedAt: string;
  ip: string | null;
  user: UserSummary;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

export interface DownloadUrlResponse {
  url: string;
  fileName: string;
  mimeType: string;
  expiresIn: number;
}

export interface SessionResponse {
  user: User;
  accessToken: string;
  expiresIn: string;
  refreshToken?: string;
}

export interface DocumentInput {
  title: string;
  description?: string | null;
  documentTypeId: number;
  folioNumber?: string | null;
  documentDate: string;
  visibleRoles: Role[];
  recipientIds: string[];
  courseIds?: string[];
  requiresAcknowledgement?: boolean;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
}
