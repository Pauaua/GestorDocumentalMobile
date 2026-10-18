import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { getConfig } from '../../config/env';
import { HttpError, unauthorized } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import type { AccessTokenPayload } from '../../middleware/auth';
import type { Tenant } from '../../middleware/tenant';
import { studentSummarySelect, toStudentSummary } from '../users/students';
import { accessibleSchools, resolveSchoolRole } from './school-access';

export const BCRYPT_ROUNDS = 12;
// Hash de referencia para comparar aun cuando el usuario no existe (evita enumeración por tiempo).
const DUMMY_HASH = bcrypt.hashSync('contraseña-inexistente', BCRYPT_ROUNDS);
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export const publicUserSelect = {
  id: true,
  fullName: true,
  rut: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const;

export type PublicUser = Pick<User, keyof typeof publicUserSelect>;

export interface SessionSchool {
  id: string;
  slug: string;
  name: string;
  primaryColor: string | null;
}

/** Usuario de una sesión de colegio (role) o de la plataforma (isPlatformAdmin). */
export type SessionUser = PublicUser & ({ role: Role; school: SessionSchool } | { isPlatformAdmin: true });

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

const toSessionSchool = (s: Pick<Tenant, 'id' | 'slug' | 'name' | 'primaryColor'>): SessionSchool => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  primaryColor: s.primaryColor,
});

function signAccessToken(userId: string, schoolId: string | null): string {
  const cfg = getConfig();
  const payload: AccessTokenPayload = { sub: userId, sid: schoolId, type: 'access' };
  return jwt.sign(payload, cfg.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: cfg.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

async function issueTokens(userId: string, schoolId: string | null, userAgent?: string): Promise<TokenPair> {
  const cfg = getConfig();
  const jti = crypto.randomUUID();
  const ttlSeconds = cfg.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await getPrisma().refreshToken.create({
    data: { id: jti, userId, schoolId, expiresAt, userAgent: userAgent?.slice(0, 255) },
  });
  const refreshToken = jwt.sign({ sub: userId, type: 'refresh' }, cfg.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    jwtid: jti,
    expiresIn: ttlSeconds,
  });
  return {
    accessToken: signAccessToken(userId, schoolId),
    accessTokenExpiresIn: cfg.JWT_ACCESS_TTL,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

async function checkPassword(email: string, password: string) {
  const user = await getPrisma().user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized(INVALID_CREDENTIALS);
  if (!user.isActive) throw unauthorized('Tu cuenta está desactivada. Contacta a la dirección del colegio.');
  const { passwordHash: _omit, isPlatformAdmin, ...publicUser } = user;
  return { publicUser, isPlatformAdmin };
}

/** Inicio de sesión en un colegio: exige una membresía activa (o administrar su red). */
export async function login(
  email: string,
  password: string,
  school: Tenant,
  userAgent?: string,
): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const { publicUser } = await checkPassword(email, password);
  const role = await resolveSchoolRole(publicUser.id, school);
  if (!role) throw unauthorized('Tu cuenta no tiene acceso a este colegio');
  const tokens = await issueTokens(publicUser.id, school.id, userAgent);
  return { user: { ...publicUser, role, school: toSessionSchool(school) }, tokens };
}

/** Inicio de sesión en la consola de la plataforma (solo superadmin). */
export async function platformLogin(
  email: string,
  password: string,
  userAgent?: string,
): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const { publicUser, isPlatformAdmin } = await checkPassword(email, password);
  if (!isPlatformAdmin) throw unauthorized(INVALID_CREDENTIALS);
  const tokens = await issueTokens(publicUser.id, null, userAgent);
  return { user: { ...publicUser, isPlatformAdmin: true }, tokens };
}

interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

function verifyRefresh(token: string): RefreshPayload {
  try {
    const payload = jwt.verify(token, getConfig().JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as RefreshPayload;
    if (payload.type !== 'refresh' || !payload.jti) throw new Error('tipo inválido');
    return payload;
  } catch {
    throw unauthorized('Sesión expirada, vuelve a iniciar sesión');
  }
}

/**
 * Rotación de refresh tokens: cada uso revoca el token y entrega uno nuevo.
 * Si llega un token ya revocado (posible robo), se revocan todas las sesiones del usuario.
 * La sesión conserva su colegio; si la solicitud viene de otro colegio se rechaza.
 */
export async function refresh(
  token: string,
  requestSchool: Tenant | undefined,
  userAgent?: string,
): Promise<{ user: SessionUser; tokens: TokenPair }> {
  const payload = verifyRefresh(token);
  const prisma = getPrisma();
  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.userId !== payload.sub) throw unauthorized('Sesión inválida');
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Sesión inválida');
  }
  if (stored.expiresAt < new Date()) throw unauthorized('Sesión expirada, vuelve a iniciar sesión');
  if (stored.schoolId && requestSchool && stored.schoolId !== requestSchool.id) {
    throw unauthorized('La sesión no corresponde a este colegio');
  }

  // Revocación condicional: si dos requests usan el mismo token a la vez, solo una gana.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw unauthorized('Sesión inválida');

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { ...publicUserSelect, isPlatformAdmin: true },
  });
  if (!user || !user.isActive) throw unauthorized('Usuario inactivo o inexistente');
  const { isPlatformAdmin, ...publicUser } = user;

  if (!stored.schoolId) {
    if (!isPlatformAdmin) throw unauthorized('Sesión inválida');
    const tokens = await issueTokens(user.id, null, userAgent);
    return { user: { ...publicUser, isPlatformAdmin: true }, tokens };
  }

  const school = await prisma.school.findUnique({ where: { id: stored.schoolId } });
  if (!school) throw unauthorized('Sesión inválida');
  if (!school.isActive) throw new HttpError(403, 'El colegio no está habilitado. Contacta a RTLCO.', 'SCHOOL_SUSPENDED');
  const role = await resolveSchoolRole(user.id, school);
  if (!role) throw unauthorized('Tu cuenta no tiene acceso a este colegio');
  const tokens = await issueTokens(user.id, school.id, userAgent);
  return { user: { ...publicUser, role, school: toSessionSchool(school) }, tokens };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  let payload: RefreshPayload;
  try {
    payload = verifyRefresh(token);
  } catch {
    return; // El logout es idempotente aunque el token sea inválido.
  }
  await getPrisma().refreshToken.updateMany({
    where: { id: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Perfil dentro del colegio actual: rol, estudiantes de este colegio y colegios disponibles. */
export async function getProfile(userId: string, role: Role, school: Tenant) {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      students: {
        where: { student: { schoolId: school.id } },
        select: { relationship: true, student: { select: studentSummarySelect } },
      },
    },
  });
  if (!user) throw unauthorized();
  const { students, ...rest } = user;
  return {
    ...rest,
    role,
    school: toSessionSchool(school),
    students: students.map((s) => ({ ...toStudentSummary(s.student), relationship: s.relationship })),
    schools: await accessibleSchools(userId),
  };
}
