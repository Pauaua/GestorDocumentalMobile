import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfigFromEnv } from '../src/config/env';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';
import { seed, SEED_PASSWORD, SEED_USERS } from '../prisma/seed';

export type SeedUserKey = (typeof SEED_USERS)[number]['key'];

export function buildApp(): Express {
  return createApp(loadConfigFromEnv());
}

export async function resetDatabase(): Promise<void> {
  loadConfigFromEnv();
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_events, outbound_emails, account_tokens, document_courses, courses, notification_deliveries, notifications, push_tokens, document_receipts, download_logs, document_recipients, document_visibility, documents, guardian_students, students, refresh_tokens, memberships, organization_admins, schools, organizations, users, document_types RESTART IDENTITY CASCADE',
  );
  await seed(prisma, { uploadFiles: false });
}

export async function closeDatabase(): Promise<void> {
  await disconnectPrisma();
}

export function emailOf(key: SeedUserKey): string {
  return SEED_USERS.find((u) => u.key === key)!.email;
}

export async function userId(key: SeedUserKey): Promise<string> {
  const user = await getPrisma().user.findUniqueOrThrow({ where: { email: emailOf(key) } });
  return user.id;
}

const tokenCache = new Map<SeedUserKey, string>();

/** Inicia sesión como un usuario del seed y devuelve el access token (cacheado por archivo de test). */
export async function tokenFor(app: Express, key: SeedUserKey): Promise<string> {
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const res = await request(app).post('/api/v1/auth/login').send({ email: emailOf(key), password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`Login de ${key} falló: ${res.status} ${JSON.stringify(res.body)}`);
  const token = (res.body as { accessToken: string }).accessToken;
  tokenCache.set(key, token);
  return token;
}

export function clearTokenCache(): void {
  tokenCache.clear();
}

export async function schoolId(slug: string): Promise<string> {
  return (await getPrisma().school.findUniqueOrThrow({ where: { slug } })).id;
}

export async function documentIdByFolio(folio: string): Promise<string> {
  const doc = await getPrisma().document.findFirstOrThrow({ where: { folioNumber: folio } });
  return doc.id;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
