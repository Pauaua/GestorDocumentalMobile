import { DeliveryStatus, Prisma } from '@prisma/client';
import { getLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';

export const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 120;

/** Tablas con la forma de outbox (status, attempts, next_attempt_at, locked_until...). */
export type OutboxTable = 'notification_deliveries' | 'outbound_emails';

/** Campos que actualiza el outbox; ambas tablas los comparten. */
interface OutboxDelegate {
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  findUniqueOrThrow(args: { where: { id: string }; select: { attempts: true } }): Promise<{ attempts: number }>;
}

/**
 * Reclama un lote pendiente. SKIP LOCKED + locked_until: varias instancias no procesan lo mismo, y un
 * proceso que muere a mitad libera el lote al vencer el bloqueo.
 * Prisma guarda TIMESTAMP sin zona en UTC: se compara con la hora UTC, no con la zona de la sesión.
 */
async function claim(table: OutboxTable, limit: number): Promise<string[]> {
  const t = Prisma.raw(`"${table}"`); // Nombre fijo del código, nunca de la solicitud.
  const rows = await getPrisma().$queryRaw<{ id: string }[]>`
    UPDATE ${t}
    SET locked_until = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LOCK_SECONDS})
    WHERE id IN (
      SELECT id FROM ${t}
      WHERE status = 'pending'
        AND next_attempt_at <= (now() AT TIME ZONE 'UTC')
        AND (locked_until IS NULL OR locked_until < (now() AT TIME ZONE 'UTC'))
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

/** Procesa un lote: marca enviados o reprograma con espera creciente (1, 2, 4, 8 min; luego fallido). */
export async function processOutbox(
  table: OutboxTable,
  delegate: OutboxDelegate,
  deliver: (id: string) => Promise<void>,
  limit: number,
): Promise<{ sent: number; failed: number }> {
  const ids = await claim(table, limit);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await deliver(id);
      await delegate.update({
        where: { id },
        data: { status: DeliveryStatus.sent, sentAt: new Date(), lockedUntil: null, attempts: { increment: 1 } },
      });
      sent++;
    } catch (err) {
      failed++;
      const { attempts: previous } = await delegate.findUniqueOrThrow({ where: { id }, select: { attempts: true } });
      const attempts = previous + 1;
      await delegate.update({
        where: { id },
        data: {
          attempts,
          lockedUntil: null,
          lastError: (err as Error).message.slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? DeliveryStatus.failed : DeliveryStatus.pending,
          nextAttemptAt: new Date(Date.now() + 2 ** (attempts - 1) * 60_000),
        },
      });
      getLogger().warn({ err, table, id, attempts }, 'Falló un envío del outbox');
    }
  }
  return { sent, failed };
}
