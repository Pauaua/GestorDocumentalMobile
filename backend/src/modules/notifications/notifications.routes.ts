import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { authenticate, currentUser } from '../../middleware/auth';
import { parse } from '../../middleware/validate';

const listSchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

// Formato de Expo: ExponentPushToken[...] o ExpoPushToken[...].
const pushTokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[\w-]+\]$/, 'Token de Expo Push inválido'),
  platform: z.enum(['ios', 'android', 'web']),
});

const preferencesSchema = z.object({ emailNotifications: z.boolean() });

/** Bandeja del usuario en el colegio de la sesión, dispositivos para push y preferencias de aviso. */
export function notificationsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    const { id: userId, schoolId } = currentUser(req);
    const q = parse(listSchema, req.query);
    const base = { userId, schoolId };
    const where = q.unread === 'true' ? { ...base, readAt: null } : base;
    const prisma = getPrisma();
    const [total, unread, items] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...base, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, title: true, body: true, documentId: true, createdAt: true, readAt: true },
      }),
    ]);
    res.json({ items, unread, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total });
  });

  router.post('/read-all', async (req, res) => {
    const { id: userId, schoolId } = currentUser(req);
    const { count } = await getPrisma().notification.updateMany({
      where: { userId, schoolId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  });

  router.post('/:id/read', async (req, res) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { id: userId, schoolId } = currentUser(req);
    const { count } = await getPrisma().notification.updateMany({
      where: { id, userId, schoolId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await getPrisma().notification.findFirst({ where: { id, userId, schoolId }, select: { id: true } });
      if (!exists) throw notFound('Notificación no encontrada');
    }
    res.status(204).end();
  });

  // Un dispositivo pertenece a una sola persona: si cambia de cuenta, el token pasa a la nueva.
  router.post('/push-tokens', async (req, res) => {
    const { token, platform } = parse(pushTokenSchema, req.body);
    const { id: userId } = currentUser(req);
    await getPrisma().pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { token, userId, platform },
    });
    res.status(204).end();
  });

  router.delete('/push-tokens/:token', async (req, res) => {
    const { id: userId } = currentUser(req);
    await getPrisma().pushToken.deleteMany({ where: { token: req.params.token, userId } });
    res.status(204).end();
  });

  router.get('/preferences', async (req, res) => {
    const user = await getPrisma().user.findUniqueOrThrow({
      where: { id: currentUser(req).id },
      select: { emailNotifications: true },
    });
    res.json(user);
  });

  router.patch('/preferences', async (req, res) => {
    const input = parse(preferencesSchema, req.body);
    const user = await getPrisma().user.update({
      where: { id: currentUser(req).id },
      data: input,
      select: { emailNotifications: true },
    });
    res.json(user);
  });

  return router;
}
