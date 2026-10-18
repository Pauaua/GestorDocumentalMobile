import { Prisma, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { activeSchool } from '../../middleware/tenant';
import { sendInvitation } from '../auth/account-tokens';
import { parse } from '../../middleware/validate';
import { hashPassword, publicUserSelect } from '../auth/auth.service';
import { ADMIN_ROLES, MANAGEMENT_ROLES } from '../auth/roles';
import { accountSchema, findOrCreateAccount, passwordSchema } from './accounts';
import { studentSummarySelect, toStudentSummary } from './students';

const createUserSchema = accountSchema.extend({ role: z.enum(Role) });

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120).optional(),
    email: z.email().transform((v) => v.toLowerCase().trim()).optional(),
    phone: z.string().trim().max(20).optional().nullable(),
    role: z.enum(Role).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar' });

const listUsersSchema = z.object({
  role: z.enum(Role).optional(),
  q: z.string().trim().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Miembro del colegio: datos de la cuenta + rol y estado en este colegio. */
function memberSelect(schoolId: string) {
  return {
    role: true,
    isActive: true,
    user: {
      select: {
        ...publicUserSelect,
        isActive: true,
        students: {
          where: { student: { schoolId } },
          select: { student: { select: studentSummarySelect } },
        },
      },
    },
  } satisfies Prisma.MembershipSelect;
}

type MemberRow = Prisma.MembershipGetPayload<{ select: ReturnType<typeof memberSelect> }>;

/** isActive: activo en el colegio y con la cuenta habilitada. */
const toDto = ({ role, isActive, user: { students, isActive: accountActive, ...u } }: MemberRow) => ({
  ...u,
  role,
  isActive: isActive && accountActive,
  students: students.map((s) => toStudentSummary(s.student)),
});

const ACCOUNT_FIELDS = ['fullName', 'email', 'phone', 'password'] as const;

export function usersRouter(): Router {
  const router = Router();
  router.use(authenticate);

  // Lectura: todo el equipo directivo (lo necesita para elegir destinatarios al subir).
  router.get('/', requireRole(...MANAGEMENT_ROLES), async (req, res) => {
    const { schoolId } = currentUser(req);
    const q = parse(listUsersSchema, req.query);
    const where: Prisma.MembershipWhereInput = {
      schoolId,
      ...(q.role ? { role: q.role } : {}),
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.q
        ? {
            user: {
              OR: [
                { fullName: { contains: q.q, mode: 'insensitive' } },
                { email: { contains: q.q, mode: 'insensitive' } },
                { rut: { contains: q.q } },
                { students: { some: { student: { schoolId, fullName: { contains: q.q, mode: 'insensitive' } } } } },
              ],
            },
          }
        : {}),
    };
    const prisma = getPrisma();
    const [total, members] = await prisma.$transaction([
      prisma.membership.count({ where }),
      prisma.membership.findMany({
        where,
        select: memberSelect(schoolId),
        orderBy: [{ role: 'asc' }, { user: { fullName: 'asc' } }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ items: members.map(toDto), total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total });
  });

  /**
   * Alta en el colegio. Si la persona ya tiene cuenta en RTLCO (mismo correo y RUT), solo se agrega
   * la membresía: su contraseña y datos no se modifican, porque la cuenta puede ser de otro colegio.
   * Sin contraseña, la persona recibe una invitación por correo para crearla.
   */
  router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
    const me = currentUser(req);
    const { schoolId } = me;
    const school = activeSchool(req);
    const { role, ...account } = parse(createUserSchema, req.body);
    const result = await getPrisma().$transaction(async (tx) => {
      const { userId, existingAccount, needsInvitation } = await findOrCreateAccount(tx, account);
      const already = await tx.membership.findUnique({ where: { userId_schoolId: { userId, schoolId } } });
      if (already) throw conflict('La persona ya es miembro de este colegio');
      const member = await tx.membership.create({ data: { userId, schoolId, role }, select: memberSelect(schoolId) });
      if (needsInvitation) await sendInvitation(tx, { id: userId, fullName: account.fullName, email: account.email }, school);
      await recordAudit(
        {
          action: existingAccount ? 'user.added_to_school' : 'user.created',
          schoolId,
          actorId: me.id,
          targetType: 'user',
          targetId: userId,
          metadata: { role, invited: needsInvitation },
          ip: req.ip,
        },
        tx,
      );
      return { ...toDto(member), existingAccount, invitationSent: needsInvitation };
    });
    res.status(201).json(result);
  });

  // Reenvía la invitación (p. ej. el enlace venció). Va al correo de la persona: no expone la cuenta.
  router.post('/:id/invite', requireRole(...ADMIN_ROLES), async (req, res) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { schoolId } = currentUser(req);
    const prisma = getPrisma();
    const membership = await prisma.membership.findUnique({
      where: { userId_schoolId: { userId: id, schoolId } },
      select: { isActive: true, user: { select: { id: true, fullName: true, email: true, isActive: true } } },
    });
    if (!membership) throw notFound('Usuario no encontrado');
    if (!membership.isActive || !membership.user.isActive) throw badRequest('La cuenta está desactivada');
    await prisma.$transaction((tx) => sendInvitation(tx, membership.user, activeSchool(req)));
    res.status(204).end();
  });

  // Gestión: solo director y sostenedor.
  router.patch('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const input = parse(updateUserSchema, req.body);
    const me = currentUser(req);
    const { schoolId } = me;
    if (id === me.id && (input.isActive === false || (input.role && input.role !== me.role))) {
      throw badRequest('No puedes desactivar tu propia cuenta ni cambiar tu propio rol');
    }
    const prisma = getPrisma();
    const membership = await prisma.membership.findUnique({ where: { userId_schoolId: { userId: id, schoolId } } });
    if (!membership) throw notFound('Usuario no encontrado');

    // Los datos de la cuenta son compartidos entre colegios: solo se editan si la cuenta es exclusiva de este.
    const touchesAccount = ACCOUNT_FIELDS.some((f) => input[f] !== undefined);
    if (touchesAccount) {
      const [otherSchools, account] = await Promise.all([
        prisma.membership.count({ where: { userId: id, schoolId: { not: schoolId } } }),
        prisma.user.findUniqueOrThrow({
          where: { id },
          select: { isPlatformAdmin: true, _count: { select: { organizationAdmin: true } } },
        }),
      ]);
      if (otherSchools > 0 || account.isPlatformAdmin || account._count.organizationAdmin > 0) {
        throw conflict('La cuenta pertenece también a otros colegios: sus datos y contraseña solo los puede cambiar la persona');
      }
    }

    const { password: newPassword, role, isActive, fullName, email, phone } = input;
    const member = await prisma.$transaction(async (tx) => {
      if (touchesAccount) {
        await tx.user.update({
          where: { id },
          data: { fullName, email, phone, ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}) },
        });
      }
      const updated = await tx.membership.update({
        where: { userId_schoolId: { userId: id, schoolId } },
        data: { role, isActive },
        select: memberSelect(schoolId),
      });
      // Al cambiar la contraseña se cierran todas sus sesiones; al desactivarlo, las de este colegio.
      if (newPassword) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      } else if (isActive === false) {
        await tx.refreshToken.updateMany({ where: { userId: id, schoolId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await recordAudit(
        {
          action: 'user.updated',
          schoolId,
          actorId: me.id,
          targetType: 'user',
          targetId: id,
          // Qué cambió, sin valores sensibles (la contraseña nunca se registra).
          metadata: { fields: Object.keys(input).filter((k) => k !== 'password'), passwordChanged: !!newPassword, role, isActive },
          ip: req.ip,
        },
        tx,
      );
      return updated;
    });
    res.json(toDto(member));
  });

  return router;
}
