import crypto from 'node:crypto';
import { NotificationChannel, type Prisma } from '@prisma/client';
import { getConfig } from '../../config/env';
import { getLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { processOutbox } from './outbox';
import { sendEmail, sendPush } from './transports';

export { MAX_ATTEMPTS } from './outbox';

/** URL base del colegio: su subdominio si hay BASE_DOMAIN; si no, PUBLIC_URL. */
export function schoolBaseUrl(schoolSlug: string): string {
  const cfg = getConfig();
  return cfg.BASE_DOMAIN ? `https://${schoolSlug}.${cfg.BASE_DOMAIN}` : (cfg.PUBLIC_URL ?? '');
}

export function documentLink(schoolSlug: string, documentId: string): string {
  return `${schoolBaseUrl(schoolSlug)}/documents/${documentId}`;
}

export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PublishedDocument {
  id: string;
  schoolId: string;
  title: string;
  typeName: string;
  requiresAcknowledgement: boolean;
}

/**
 * Avisa a cada persona de la audiencia: notificación en la bandeja + envío por correo (si no lo desactivó)
 * y push (si tiene dispositivos). Los envíos quedan en el outbox: publicar no espera al correo.
 */
export async function notifyDocumentPublished(doc: PublishedDocument, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, emailNotifications: true, _count: { select: { pushTokens: true } } },
  });
  const title = doc.requiresAcknowledgement ? `${doc.typeName}: requiere tu confirmación` : `Nuevo documento: ${doc.typeName}`;
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
  for (const u of users) {
    const id = crypto.randomUUID();
    notifications.push({ id, schoolId: doc.schoolId, userId: u.id, documentId: doc.id, title, body: doc.title });
    if (u.emailNotifications) deliveries.push({ notificationId: id, channel: NotificationChannel.email });
    if (u._count.pushTokens > 0) deliveries.push({ notificationId: id, channel: NotificationChannel.push });
  }
  await prisma.$transaction([
    prisma.notification.createMany({ data: notifications }),
    prisma.notificationDelivery.createMany({ data: deliveries }),
  ]);
  return notifications.length;
}

async function deliver(deliveryId: string): Promise<void> {
  const prisma = getPrisma();
  const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: {
      notification: {
        include: {
          school: { select: { slug: true, name: true } },
          user: { select: { id: true, email: true, fullName: true, emailNotifications: true, pushTokens: { select: { token: true } } } },
        },
      },
    },
  });
  const { notification: n } = delivery;
  const link = n.documentId ? documentLink(n.school.slug, n.documentId) : '';

  if (delivery.channel === NotificationChannel.email) {
    if (!n.user.emailNotifications) return; // Desactivó los correos después de crearse el aviso.
    // Sin el contenido del documento: solo el aviso y el enlace (el acceso exige iniciar sesión).
    await sendEmail({
      to: n.user.email,
      subject: `${n.title} · ${n.school.name}`,
      text: `Hola ${n.user.fullName}:\n\n${n.school.name} publicó un documento para ti: "${n.body}".\nRevísalo en RTLCO: ${link}\n\nPara dejar de recibir estos correos, cambia tus preferencias en tu perfil.`,
      html: `<p>Hola ${escapeHtml(n.user.fullName)}:</p><p>${escapeHtml(n.school.name)} publicó un documento para ti: <strong>${escapeHtml(n.body)}</strong>.</p><p><a href="${escapeHtml(link)}">Revisar en RTLCO</a></p><p style="color:#666;font-size:12px">Para dejar de recibir estos correos, cambia tus preferencias en tu perfil.</p>`,
    });
    return;
  }

  const tokens = n.user.pushTokens.map((t) => t.token);
  if (tokens.length === 0) return;
  const { invalidTokens } = await sendPush({
    tokens,
    title: n.title,
    body: n.body,
    data: { schoolSlug: n.school.slug, ...(n.documentId ? { documentId: n.documentId } : {}) },
  });
  if (invalidTokens.length > 0) await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
}

/** Procesa un lote de avisos (correo y push). */
export function processDeliveries(limit = 25): Promise<{ sent: number; failed: number }> {
  return processOutbox('notification_deliveries', getPrisma().notificationDelivery, deliver, limit);
}

/** Correo transaccional (invitación, recuperación de contraseña) al outbox: se envía con reintentos. */
export async function enqueueEmail(
  message: { to: string; subject: string; text: string; html: string },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await (tx ?? getPrisma()).outboundEmail.create({ data: message });
}

async function deliverOutboundEmail(id: string): Promise<void> {
  const email = await getPrisma().outboundEmail.findUniqueOrThrow({ where: { id } });
  await sendEmail({ to: email.to, subject: email.subject, text: email.text, html: email.html });
}

export function processOutboundEmails(limit = 25): Promise<{ sent: number; failed: number }> {
  return processOutbox('outbound_emails', getPrisma().outboundEmail, deliverOutboundEmail, limit);
}

let timer: NodeJS.Timeout | undefined;

/** Worker en cada instancia: revisa ambos outbox (correos transaccionales y avisos) cada pocos segundos. */
export function startNotificationWorker(intervalMs = 5000): () => void {
  let running = false;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    Promise.all([processOutboundEmails(), processDeliveries()])
      .catch((err: unknown) => getLogger().error({ err }, 'Error en el worker de notificaciones'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
