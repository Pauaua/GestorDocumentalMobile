import { Plan, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';
import { authenticatePlatform, currentPlatformUser } from '../../middleware/auth';
import { sendInvitation } from '../auth/account-tokens';
import { RESERVED_SLUGS, SLUG_PATTERN } from '../../middleware/tenant';
import { parse } from '../../middleware/validate';
import { accountSchema, findOrCreateAccount, rutSchema } from '../users/accounts';

const idParam = z.object({ id: z.uuid('Identificador inválido') });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, 'Solo minúsculas, números y guiones (2 a 40 caracteres)')
  .refine((v) => v.length >= 2 && !RESERVED_SLUGS.has(v), 'Subdominio no disponible');

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato #RRGGBB');

const schoolFields = {
  name: z.string().trim().min(3).max(150),
  rbd: z.string().trim().regex(/^\d{1,6}(-\d)?$/, 'RBD inválido').optional().nullable(),
  organizationId: z.uuid().optional().nullable(),
  plan: z.enum(Plan).optional(),
  primaryColor: color.optional().nullable(),
};

const createSchoolSchema = z.object({ ...schoolFields, slug, director: accountSchema });

const updateSchoolSchema = z
  .object({
    name: schoolFields.name.optional(),
    rbd: schoolFields.rbd,
    organizationId: schoolFields.organizationId,
    plan: schoolFields.plan,
    primaryColor: schoolFields.primaryColor,
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar' });

const createOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(150),
  rut: rutSchema.optional().nullable(),
});

const schoolSelect = {
  id: true,
  slug: true,
  name: true,
  rbd: true,
  plan: true,
  primaryColor: true,
  isActive: true,
  createdAt: true,
  organization: { select: { id: true, name: true } },
  _count: { select: { memberships: true, documents: true } },
} as const;

async function assertOrganization(organizationId: string | null | undefined): Promise<void> {
  if (!organizationId) return;
  const org = await getPrisma().organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw badRequest('La red indicada no existe');
}

/**
 * Consola de RTLCO (superadmin): alta y suspensión de colegios, planes y redes.
 * Solo expone metadatos y conteos: el superadmin no accede a los documentos de los colegios.
 */
export function platformRouter(): Router {
  const router = Router();
  router.use(authenticatePlatform);

  router.get('/schools', async (_req, res) => {
    res.json(await getPrisma().school.findMany({ select: schoolSelect, orderBy: { name: 'asc' } }));
  });

  // Crea el colegio y su director(a) inicial en una sola operación.
  router.post('/schools', async (req, res) => {
    const { director, ...input } = parse(createSchoolSchema, req.body);
    await assertOrganization(input.organizationId);
    const prisma = getPrisma();
    if (await prisma.school.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
      throw conflict('El subdominio ya está en uso');
    }
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({ data: input, select: { id: true, slug: true, name: true } });
      const { userId, existingAccount, needsInvitation } = await findOrCreateAccount(tx, director);
      await tx.membership.create({ data: { userId, schoolId: school.id, role: Role.director } });
      if (needsInvitation) await sendInvitation(tx, { id: userId, fullName: director.fullName, email: director.email }, school);
      await recordAudit(
        {
          action: 'platform.school_created',
          schoolId: school.id,
          actorId: currentPlatformUser(req).id,
          targetType: 'school',
          targetId: school.id,
          metadata: { slug: school.slug, plan: input.plan ?? 'basico', directorId: userId },
          ip: req.ip,
        },
        tx,
      );
      const created = await tx.school.findUniqueOrThrow({ where: { id: school.id }, select: schoolSelect });
      return { ...created, director: { id: userId, existingAccount, invitationSent: needsInvitation } };
    });
    res.status(201).json(result);
  });

  router.patch('/schools/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateSchoolSchema, req.body);
    await assertOrganization(input.organizationId);
    const prisma = getPrisma();
    if (!(await prisma.school.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Colegio no encontrado');
    const school = await prisma.$transaction(async (tx) => {
      const updated = await tx.school.update({ where: { id }, data: input, select: schoolSelect });
      // Suspender un colegio cierra sus sesiones.
      if (input.isActive === false) {
        await tx.refreshToken.updateMany({ where: { schoolId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await recordAudit(
        {
          action: 'platform.school_updated',
          schoolId: id,
          actorId: currentPlatformUser(req).id,
          targetType: 'school',
          targetId: id,
          metadata: input,
          ip: req.ip,
        },
        tx,
      );
      return updated;
    });
    res.json(school);
  });

  router.get('/organizations', async (_req, res) => {
    res.json(
      await getPrisma().organization.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          rut: true,
          createdAt: true,
          schools: { select: { id: true, slug: true, name: true, isActive: true }, orderBy: { name: 'asc' } },
          admins: { select: { user: { select: { id: true, fullName: true, email: true } } } },
        },
      }),
    );
  });

  router.post('/organizations', async (req, res) => {
    const input = parse(createOrganizationSchema, req.body);
    const org = await getPrisma().organization.create({ data: input });
    await recordAudit({
      action: 'platform.organization_created',
      actorId: currentPlatformUser(req).id,
      targetType: 'organization',
      targetId: org.id,
      ip: req.ip,
    });
    res.status(201).json(org);
  });

  // Sostenedor de red: administra todos los colegios de la organización.
  router.post('/organizations/:id/admins', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const account = parse(accountSchema, req.body);
    const prisma = getPrisma();
    if (!(await prisma.organization.findUnique({ where: { id }, select: { id: true } }))) {
      throw notFound('Red no encontrada');
    }
    const result = await prisma.$transaction(async (tx) => {
      const { userId, existingAccount } = await findOrCreateAccount(tx, account);
      const already = await tx.organizationAdmin.findUnique({
        where: { userId_organizationId: { userId, organizationId: id } },
      });
      if (already) throw conflict('La persona ya administra esta red');
      await tx.organizationAdmin.create({ data: { userId, organizationId: id } });
      await recordAudit(
        {
          action: 'platform.organization_admin_added',
          actorId: currentPlatformUser(req).id,
          targetType: 'organization',
          targetId: id,
          metadata: { userId },
          ip: req.ip,
        },
        tx,
      );
      return { userId, organizationId: id, existingAccount };
    });
    res.status(201).json(result);
  });

  return router;
}
