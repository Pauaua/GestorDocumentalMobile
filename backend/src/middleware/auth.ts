import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { getConfig } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { getPrisma } from '../lib/prisma';
import { resolveSchoolRole } from '../modules/auth/school-access';
import { activeSchool } from './tenant';

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  schoolId: string;
}

export interface PlatformUser {
  id: string;
  fullName: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      platformUser?: PlatformUser;
    }
  }
}

/** sid: colegio de la sesión; null en las sesiones de la plataforma. */
export interface AccessTokenPayload {
  sub: string;
  sid: string | null;
  type: 'access';
}

function verifyAccessToken(req: Request): AccessTokenPayload {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(header.slice(7), getConfig().JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;
  } catch {
    throw unauthorized('Token inválido o expirado');
  }
  if (payload.type !== 'access' || payload.sid === undefined) throw unauthorized('Token inválido');
  return payload;
}

async function loadActiveUser(id: string) {
  const user = await getPrisma().user.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, isActive: true, isPlatformAdmin: true },
  });
  if (!user || !user.isActive) throw unauthorized('Usuario inactivo o inexistente');
  return user;
}

/**
 * Verifica el access token (Bearer) del colegio de la solicitud.
 * El token queda atado al colegio en que se inició sesión: no sirve en otro colegio.
 * El rol se toma de la BD y no del token: un cambio de rol o una desactivación aplica de inmediato.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const school = activeSchool(req);
  const payload = verifyAccessToken(req);
  if (payload.sid !== school.id) throw unauthorized('La sesión no corresponde a este colegio');
  const user = await loadActiveUser(payload.sub);
  const role = await resolveSchoolRole(user.id, school);
  if (!role) throw unauthorized('No tienes acceso a este colegio');
  req.user = { id: user.id, role, fullName: user.fullName, email: user.email, schoolId: school.id };
  next();
}

/** Sesiones de la plataforma (superadmin RTLCO). */
export async function authenticatePlatform(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const payload = verifyAccessToken(req);
  if (payload.sid !== null) throw forbidden('Inicia sesión en la consola de la plataforma');
  const user = await loadActiveUser(payload.sub);
  if (!user.isPlatformAdmin) throw forbidden();
  req.platformUser = { id: user.id, fullName: user.fullName, email: user.email };
  next();
}

/** Autoriza por rol. Debe ir después de `authenticate`. */
export function requireRole(...roles: readonly Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function currentPlatformUser(req: Request): PlatformUser {
  if (!req.platformUser) throw unauthorized();
  return req.platformUser;
}
