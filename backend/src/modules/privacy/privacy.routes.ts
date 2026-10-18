import { Router } from 'express';
import { recordAudit } from '../../lib/audit';
import { getPrisma } from '../../lib/prisma';
import { authenticate, currentUser } from '../../middleware/auth';
import { studentSummarySelect, toStudentSummary } from '../users/students';

/**
 * Derechos de las personas titulares (Ley 21.719): acceso y portabilidad de sus datos.
 * Exporta lo que RTLCO guarda de la persona en formato JSON legible por máquina.
 * La rectificación y supresión se gestionan con el colegio (responsable del tratamiento): ver docs/legal.
 */
export function privacyRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/export', async (req, res) => {
    const { id } = currentUser(req);
    const prisma = getPrisma();
    const [user, receipts, downloads, notifications, activity] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          fullName: true,
          rut: true,
          email: true,
          phone: true,
          isActive: true,
          emailNotifications: true,
          createdAt: true,
          memberships: { select: { role: true, isActive: true, createdAt: true, school: { select: { slug: true, name: true } } } },
          organizationAdmin: { select: { createdAt: true, organization: { select: { name: true } } } },
          students: { select: { relationship: true, student: { select: { ...studentSummarySelect, rut: true } } } },
          pushTokens: { select: { platform: true, createdAt: true, lastSeenAt: true } },
          refreshTokens: { select: { createdAt: true, expiresAt: true, revokedAt: true, userAgent: true }, orderBy: { createdAt: 'desc' }, take: 50 },
        },
      }),
      prisma.documentReceipt.findMany({
        where: { userId: id },
        select: { viewedAt: true, acknowledgedAt: true, ip: true, document: { select: { id: true, title: true } } },
      }),
      prisma.downloadLog.findMany({
        where: { userId: id },
        select: { downloadedAt: true, ip: true, document: { select: { id: true, title: true } } },
        orderBy: { downloadedAt: 'desc' },
      }),
      prisma.notification.findMany({
        where: { userId: id },
        select: { title: true, body: true, createdAt: true, readAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditEvent.findMany({
        where: { actorId: id },
        select: { action: true, createdAt: true, ip: true, targetType: true, targetId: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);
    const { students, ...profile } = user;
    await recordAudit({ action: 'data.exported', schoolId: currentUser(req).schoolId, actorId: id, targetType: 'user', targetId: id, ip: req.ip });
    res.attachment(`mis-datos-rtlco-${new Date().toISOString().slice(0, 10)}.json`);
    res.json({
      generatedAt: new Date().toISOString(),
      profile,
      students: students.map((s) => ({ ...toStudentSummary(s.student), rut: s.student.rut, relationship: s.relationship })),
      receipts,
      downloads,
      notifications,
      activity,
    });
  });

  return router;
}
