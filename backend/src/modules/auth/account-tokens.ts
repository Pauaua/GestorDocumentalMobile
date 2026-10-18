import crypto from 'node:crypto';
import { AccountTokenPurpose, type Prisma } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { enqueueEmail, escapeHtml, schoolBaseUrl } from '../notifications/notifications.service';

/** Recuperación: 1 hora. Invitación: 7 días (la persona puede tardar en ver el correo). */
const TTL_MS: Record<AccountTokenPurpose, number> = {
  reset: 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000,
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const INVALID_LINK = 'El enlace no es válido o expiró. Pide uno nuevo.';

/** Emite un token de un solo uso (se guarda solo su hash). Invalida los anteriores del mismo tipo. */
async function issueAccountToken(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: AccountTokenPurpose,
  schoolId: string | null,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await tx.accountToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await tx.accountToken.create({
    data: { userId, purpose, schoolId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[purpose]) },
  });
  return token;
}

async function findValidToken(token: string) {
  const stored = await getPrisma().accountToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, fullName: true, email: true, isActive: true } } },
  });
  if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.user.isActive) throw badRequest(INVALID_LINK);
  return stored;
}

/** Datos para la pantalla de "crear / cambiar contraseña" (sin consumir el token). */
export async function describeAccountToken(token: string) {
  const stored = await findValidToken(token);
  return { purpose: stored.purpose, fullName: stored.user.fullName, email: stored.user.email };
}

/**
 * Consume el token dentro de la transacción del llamador: si algo falla después, el enlace sigue sirviendo.
 * La marca condicional (usedAt null) evita que dos solicitudes simultáneas usen el mismo enlace.
 */
export async function consumeAccountToken(tx: Prisma.TransactionClient, token: string) {
  const stored = await findValidToken(token);
  const { count } = await tx.accountToken.updateMany({
    where: { id: stored.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw badRequest(INVALID_LINK);
  return { userId: stored.userId, purpose: stored.purpose, schoolId: stored.schoolId };
}

interface MailSchool {
  id: string;
  slug: string;
  name: string;
}

/** Invitación a activar la cuenta (alta manual sin contraseña o importación masiva). */
export async function sendInvitation(
  tx: Prisma.TransactionClient,
  user: { id: string; fullName: string; email: string },
  school: MailSchool,
): Promise<void> {
  const token = await issueAccountToken(tx, user.id, AccountTokenPurpose.invite, school.id);
  const link = `${schoolBaseUrl(school.slug)}/reset-password?token=${token}`;
  await enqueueEmail(
    {
      to: user.email,
      subject: `Te damos la bienvenida a RTLCO · ${school.name}`,
      text: `Hola ${user.fullName}:\n\n${school.name} te invitó a RTLCO, donde recibirás sus documentos oficiales.\nCrea tu contraseña aquí (el enlace vence en 7 días): ${link}\n\nCódigo del colegio en la app: ${school.slug}`,
      html: `<p>Hola ${escapeHtml(user.fullName)}:</p><p>${escapeHtml(school.name)} te invitó a RTLCO, donde recibirás sus documentos oficiales.</p><p><a href="${escapeHtml(link)}">Crear mi contraseña</a> (el enlace vence en 7 días).</p><p>Código del colegio en la app: <strong>${escapeHtml(school.slug)}</strong></p>`,
    },
    tx,
  );
}

/** Recuperación de contraseña (enlace de 1 hora). */
export async function sendPasswordReset(
  tx: Prisma.TransactionClient,
  user: { id: string; fullName: string; email: string },
  school: MailSchool,
): Promise<void> {
  const token = await issueAccountToken(tx, user.id, AccountTokenPurpose.reset, school.id);
  const link = `${schoolBaseUrl(school.slug)}/reset-password?token=${token}`;
  await enqueueEmail(
    {
      to: user.email,
      subject: 'Recupera tu contraseña de RTLCO',
      text: `Hola ${user.fullName}:\n\nPediste cambiar tu contraseña. Hazlo aquí (el enlace vence en 1 hora): ${link}\n\nSi no fuiste tú, ignora este correo: tu contraseña no cambia.`,
      html: `<p>Hola ${escapeHtml(user.fullName)}:</p><p>Pediste cambiar tu contraseña. <a href="${escapeHtml(link)}">Cámbiala aquí</a> (el enlace vence en 1 hora).</p><p>Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>`,
    },
    tx,
  );
}
