import type { NextFunction, Request, Response } from 'express';
import type { School } from '@prisma/client';
import { getConfig } from '../config/env';
import { HttpError, notFound } from '../lib/errors';
import { getPrisma } from '../lib/prisma';

export type Tenant = Pick<School, 'id' | 'slug' | 'name' | 'organizationId' | 'plan' | 'primaryColor' | 'isActive'>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      school?: Tenant;
    }
  }
}

/** Subdominios que no son colegios. */
export const RESERVED_SLUGS = new Set(['app', 'api', 'www', 'admin', 'plataforma', 'platform', 'static', 'mail', 'status']);
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const tenantSelect = {
  id: true,
  slug: true,
  name: true,
  organizationId: true,
  plan: true,
  primaryColor: true,
  isActive: true,
} as const;

function slugFromHost(hostname: string, baseDomain: string | undefined): string | undefined {
  const host = hostname.toLowerCase();
  for (const suffix of [baseDomain, 'localhost'].filter(Boolean) as string[]) {
    if (host.endsWith(`.${suffix}`)) {
      const label = host.slice(0, -(suffix.length + 1));
      // Solo un nivel: demo.rtlco.cl sí, x.demo.rtlco.cl no.
      return label.includes('.') ? undefined : label;
    }
  }
  return undefined;
}

/**
 * Determina el colegio de la solicitud:
 *   1. Subdominio de BASE_DOMAIN (web en producción): demo.rtlco.cl → "demo"
 *   2. Header X-School (app nativa y desarrollo)
 *   3. DEFAULT_SCHOOL_SLUG (solo desarrollo y tests)
 * Sin colegio la solicitud sigue (rutas de plataforma); con un slug desconocido responde 404.
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cfg = getConfig();
  const fromHost = slugFromHost(req.hostname, cfg.BASE_DOMAIN);
  const header = req.get('x-school')?.trim().toLowerCase();
  const slug = [fromHost, header, cfg.DEFAULT_SCHOOL_SLUG].find((s) => s && !RESERVED_SLUGS.has(s));
  if (!slug) return next();
  if (!SLUG_PATTERN.test(slug)) throw notFound('Colegio no encontrado');

  const school = await getPrisma().school.findUnique({ where: { slug }, select: tenantSelect });
  if (!school) throw notFound('Colegio no encontrado');
  req.school = school;
  next();
}

/** Colegio de la solicitud; falla si no hay uno o si está suspendido (p. ej. por falta de pago). */
export function activeSchool(req: Request): Tenant {
  if (!req.school) throw new HttpError(400, 'Indica el colegio (subdominio o header X-School)', 'SCHOOL_REQUIRED');
  if (!req.school.isActive) throw new HttpError(403, 'El colegio no está habilitado. Contacta a RTLCO.', 'SCHOOL_SUSPENDED');
  return req.school;
}
