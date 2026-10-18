import type { Prisma } from '@prisma/client';
import { getLogger } from './logger';
import { getPrisma } from './prisma';

/**
 * Acciones auditadas. La bitácora responde "quién hizo qué, cuándo y desde dónde" ante un reclamo,
 * una fiscalización o un incidente de seguridad (Ley 21.719).
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.invitation_accepted'
  | 'document.created'
  | 'document.updated'
  | 'document.deleted'
  | 'document.acknowledged'
  | 'user.created'
  | 'user.added_to_school'
  | 'user.updated'
  | 'import.people'
  | 'import.students'
  | 'data.exported'
  | 'platform.school_created'
  | 'platform.school_updated'
  | 'platform.organization_created'
  | 'platform.organization_admin_added';

export interface AuditEntry {
  action: AuditAction;
  schoolId?: string | null;
  actorId?: string | null;
  targetType?: 'document' | 'user' | 'school' | 'organization' | 'import';
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Registra un evento. Un fallo de la bitácora no interrumpe la operación auditada: queda en el log. */
export async function recordAudit(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
  try {
    await (tx ?? getPrisma()).auditEvent.create({
      data: {
        action: entry.action,
        schoolId: entry.schoolId ?? null,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    if (tx) throw err; // Dentro de una transacción el error debe revertirla.
    getLogger().error({ err, audit: entry }, 'No se pudo registrar el evento de auditoría');
  }
}
