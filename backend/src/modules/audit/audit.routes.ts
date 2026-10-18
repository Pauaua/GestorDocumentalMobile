import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../lib/prisma';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { ADMIN_ROLES } from '../auth/roles';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD');

const listSchema = z.object({
  /** Prefijo de la acción: "document", "auth.login", ... */
  action: z.string().trim().max(60).optional(),
  actorId: z.uuid().optional(),
  targetId: z.string().trim().max(60).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Bitácora del colegio: dirección y sostenedor (respaldo ante reclamos, fiscalización e incidentes). */
export function auditRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole(...ADMIN_ROLES));

  router.get('/', async (req, res) => {
    const { schoolId } = currentUser(req);
    const q = parse(listSchema, req.query);
    const where: Prisma.AuditEventWhereInput = {
      schoolId,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            createdAt: {
              ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00.000Z`) } : {}),
              // Hasta el final del día indicado.
              ...(q.dateTo ? { lt: new Date(new Date(`${q.dateTo}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    };
    const prisma = getPrisma();
    const [total, events] = await prisma.$transaction([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    // Sin claves foráneas: los nombres se resuelven aparte (una cuenta borrada queda como "desconocido").
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((id): id is string => !!id))];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    res.json({
      items: events.map((e) => ({ ...e, actor: e.actorId ? { id: e.actorId, fullName: names.get(e.actorId) ?? null } : null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      hasMore: q.page * q.pageSize < total,
    });
  });

  return router;
}
