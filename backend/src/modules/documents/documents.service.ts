import crypto from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { getLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import * as s3 from '../../lib/s3';
import type { AuthUser } from '../../middleware/auth';
import { notifyDocumentPublished } from '../notifications/notifications.service';
import { canDeleteDocument, canEditDocument, canSeeAudience, visibleDocumentsWhere } from './access';
import { audienceUserIds, audienceWhere } from './audience';
import type { AllowedMimeType, CreateDocumentInput, ListDocumentsQuery, UpdateDocumentInput } from './documents.schemas';

/** Persona con su rol en el colegio del documento. */
function personSelect(schoolId: string) {
  return {
    id: true,
    fullName: true,
    memberships: { where: { schoolId }, select: { role: true } },
  } satisfies Prisma.UserSelect;
}

type PersonRow = Prisma.UserGetPayload<{ select: ReturnType<typeof personSelect> }>;

/** Sin membresía solo se accede como sostenedor de la red del colegio. */
const toPerson = ({ memberships, ...p }: PersonRow) => ({ ...p, role: memberships[0]?.role ?? Role.sostenedor });

/** Datos de la solicitud que quedan en el acuse de recibo. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

function documentInclude(user: AuthUser) {
  return {
    documentType: { select: { id: true, code: true, name: true } },
    author: { select: personSelect(user.schoolId) },
    visibility: { select: { role: true } },
    recipients: { select: { user: { select: personSelect(user.schoolId) } } },
    courses: { select: { course: { select: { id: true, name: true } } } },
    // Solo el acuse propio; el informe completo es GET /documents/:id/receipts.
    receipts: { where: { userId: user.id }, select: { viewedAt: true, acknowledgedAt: true } },
  } satisfies Prisma.DocumentInclude;
}

type DocumentWithRelations = Prisma.DocumentGetPayload<{ include: ReturnType<typeof documentInclude> }>;

/** Serializa un documento. La audiencia (roles y destinatarios) solo la ve el equipo directivo. */
function toDto(doc: DocumentWithRelations, user: AuthUser) {
  const base = {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    documentType: doc.documentType,
    folioNumber: doc.folioNumber,
    documentDate: doc.documentDate.toISOString().slice(0, 10),
    author: toPerson(doc.author),
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    status: doc.status,
    requiresAcknowledgement: doc.requiresAcknowledgement,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    permissions: {
      canEdit: canEditDocument(user, doc),
      canDelete: canDeleteDocument(user),
      canViewDownloads: canSeeAudience(user),
      canAcknowledge: doc.requiresAcknowledgement && !canSeeAudience(user),
    },
  };
  if (!canSeeAudience(user)) return { ...base, myReceipt: doc.receipts[0] ?? null };
  return {
    ...base,
    visibleRoles: doc.visibility.map((v) => v.role),
    recipients: doc.recipients.map((r) => toPerson(r.user)),
    courses: doc.courses.map((c) => c.course),
  };
}

function sanitizeFileName(name: string): string {
  const normalized = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'archivo';
}

/**
 * Cada usuario sube bajo el prefijo de su colegio y el suyo propio:
 * así nadie puede registrar un objeto subido por otro ni desde otro colegio.
 */
function userPrefix(user: AuthUser): string {
  return `schools/${user.schoolId}/documents/${user.id}/`;
}

export async function createUploadUrl(
  user: AuthUser,
  input: { fileName: string; mimeType: AllowedMimeType; fileSize: number },
) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const s3Key = `${userPrefix(user)}${month}/${crypto.randomUUID()}-${sanitizeFileName(input.fileName)}`;
  const uploadUrl = await s3.createUploadUrl(s3Key, input.mimeType, input.fileSize);
  return {
    uploadUrl,
    s3Key,
    method: 'PUT' as const,
    headers: { 'Content-Type': input.mimeType },
    expiresIn: s3.UPLOAD_URL_TTL_SECONDS,
  };
}

async function assertDocumentType(documentTypeId: number): Promise<void> {
  const type = await getPrisma().documentType.findUnique({ where: { id: documentTypeId } });
  if (!type) throw badRequest('Tipo de documento inválido');
}

/** Los destinatarios deben ser miembros activos del colegio. */
async function assertRecipients(schoolId: string, recipientIds: string[]): Promise<void> {
  if (recipientIds.length === 0) return;
  const unique = [...new Set(recipientIds)];
  const count = await getPrisma().membership.count({
    where: { schoolId, userId: { in: unique }, isActive: true, user: { isActive: true } },
  });
  if (count !== unique.length) throw badRequest('Uno o más destinatarios no existen o están inactivos');
}

/** Los cursos deben ser del colegio. */
async function assertCourses(schoolId: string, courseIds: string[]): Promise<void> {
  if (courseIds.length === 0) return;
  const unique = [...new Set(courseIds)];
  const count = await getPrisma().course.count({ where: { schoolId, id: { in: unique } } });
  if (count !== unique.length) throw badRequest('Uno o más cursos no existen en este colegio');
}

/** Audiencia de un documento cargado con sus relaciones. */
const audienceOf = (doc: DocumentWithRelations) => ({
  visibleRoles: doc.visibility.map((v) => v.role),
  recipientIds: doc.recipients.map((r) => r.user.id),
  courseIds: doc.courses.map((c) => c.course.id),
});

export async function createDocument(user: AuthUser, input: CreateDocumentInput, ctx: RequestContext = {}) {
  if (!input.s3Key.startsWith(userPrefix(user))) throw forbidden('La clave del archivo no corresponde a tu subida');
  await assertDocumentType(input.documentTypeId);
  await assertRecipients(user.schoolId, input.recipientIds);
  await assertCourses(user.schoolId, input.courseIds);

  // Confirma que el archivo realmente se subió a S3 y coincide con lo declarado.
  const object = await s3.headObject(input.s3Key);
  if (!object) throw badRequest('El archivo no se encuentra en el almacenamiento. Vuelve a subirlo.');
  if (object.size !== input.fileSize) throw badRequest('El tamaño del archivo no coincide con el declarado');

  const doc = await getPrisma().document.create({
    data: {
      schoolId: user.schoolId,
      title: input.title,
      description: input.description ?? null,
      documentTypeId: input.documentTypeId,
      folioNumber: input.folioNumber ?? null,
      documentDate: new Date(`${input.documentDate}T00:00:00.000Z`),
      authorId: user.id,
      s3Key: input.s3Key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      requiresAcknowledgement: input.requiresAcknowledgement,
      visibility: { create: [...new Set(input.visibleRoles)].map((role) => ({ role })) },
      recipients: { create: [...new Set(input.recipientIds)].map((userId) => ({ userId })) },
      courses: { create: [...new Set(input.courseIds)].map((courseId) => ({ courseId })) },
    },
    include: documentInclude(user),
  });
  await recordAudit({
    action: 'document.created',
    schoolId: user.schoolId,
    actorId: user.id,
    targetType: 'document',
    targetId: doc.id,
    metadata: { title: doc.title, type: doc.documentType.code, audience: audienceOf(doc) },
    ip: ctx.ip,
  });
  await notifyNewAudience(user, doc);
  return toDto(doc, user);
}

/**
 * Avisa a la audiencia del documento que aún no recibió aviso (al publicarlo o al ampliar su audiencia).
 * Un error al crear los avisos no revierte la publicación: queda en el log.
 */
async function notifyNewAudience(user: AuthUser, doc: DocumentWithRelations): Promise<void> {
  if (doc.status !== 'VIGENTE') return;
  try {
    const audience = await audienceUserIds(user.schoolId, audienceOf(doc));
    const already = await getPrisma().notification.findMany({
      where: { documentId: doc.id, userId: { in: audience } },
      select: { userId: true },
    });
    const notified = new Set([user.id, ...already.map((n) => n.userId)]);
    await notifyDocumentPublished(
      {
        id: doc.id,
        schoolId: doc.schoolId,
        title: doc.title,
        typeName: doc.documentType.name,
        requiresAcknowledgement: doc.requiresAcknowledgement,
      },
      audience.filter((id) => !notified.has(id)),
    );
  } catch (err) {
    getLogger().error({ err, documentId: doc.id }, 'No se pudieron crear los avisos del documento');
  }
}

export async function listDocuments(user: AuthUser, query: ListDocumentsQuery) {
  const filters: Prisma.DocumentWhereInput[] = [visibleDocumentsWhere(user)];
  if (query.typeId) filters.push({ documentTypeId: query.typeId });
  if (query.type) filters.push({ documentType: { code: query.type } });
  if (query.authorId) filters.push({ authorId: query.authorId });
  if (query.status) filters.push({ status: query.status });
  if (query.dateFrom || query.dateTo) {
    filters.push({
      documentDate: {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00.000Z`) } : {}),
      },
    });
  }
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' as const };
    filters.push({
      OR: [{ title: contains }, { description: contains }, { folioNumber: contains }, { fileName: contains }],
    });
  }
  const where: Prisma.DocumentWhereInput = { AND: filters };
  const prisma = getPrisma();
  const [total, docs] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      include: documentInclude(user),
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: docs.map((d) => toDto(d, user)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasMore: query.page * query.pageSize < total,
  };
}

/**
 * Carga un documento verificando la visibilidad.
 * 404 si no existe o fue eliminado; 403 si existe pero el usuario no tiene acceso.
 */
async function findAccessibleDocument(user: AuthUser, id: string): Promise<DocumentWithRelations> {
  const prisma = getPrisma();
  const doc = await prisma.document.findFirst({
    where: { AND: [{ id }, visibleDocumentsWhere(user)] },
    include: documentInclude(user),
  });
  if (doc) return doc;
  // Un documento de otro colegio responde 404: no se revela que existe.
  const exists = await prisma.document.findFirst({
    where: { id, schoolId: user.schoolId, isDeleted: false },
    select: { id: true },
  });
  if (exists) throw forbidden('No tienes acceso a este documento');
  throw notFound('Documento no encontrado');
}

/** Primera apertura de la audiencia (el equipo directivo no genera acuse). */
async function markViewed(user: AuthUser, doc: DocumentWithRelations, ctx: RequestContext): Promise<void> {
  if (canSeeAudience(user) || doc.receipts.length > 0) return;
  const receipt = await getPrisma().documentReceipt.upsert({
    where: { documentId_userId: { documentId: doc.id, userId: user.id } },
    update: {},
    create: { documentId: doc.id, userId: user.id, ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 255) ?? null },
    select: { viewedAt: true, acknowledgedAt: true },
  });
  doc.receipts = [receipt];
}

export async function getDocument(user: AuthUser, id: string, ctx: RequestContext = {}) {
  const doc = await findAccessibleDocument(user, id);
  await markViewed(user, doc, ctx);
  return toDto(doc, user);
}

/** Confirmación explícita de recepción (solo documentos que la exigen y solo la audiencia). */
export async function acknowledgeDocument(user: AuthUser, id: string, ctx: RequestContext = {}) {
  const doc = await findAccessibleDocument(user, id);
  if (canSeeAudience(user)) throw badRequest('El equipo directivo no confirma recepción de documentos');
  if (!doc.requiresAcknowledgement) throw badRequest('Este documento no requiere confirmación de recepción');
  await markViewed(user, doc, ctx);
  const prisma = getPrisma();
  // Solo la primera confirmación cuenta: repetirla no cambia la fecha.
  await prisma.documentReceipt.updateMany({
    where: { documentId: id, userId: user.id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 255) ?? null },
  });
  const receipt = await prisma.documentReceipt.findUniqueOrThrow({
    where: { documentId_userId: { documentId: id, userId: user.id } },
    select: { viewedAt: true, acknowledgedAt: true },
  });
  await recordAudit({
    action: 'document.acknowledged',
    schoolId: user.schoolId,
    actorId: user.id,
    targetType: 'document',
    targetId: id,
    ip: ctx.ip,
  });
  return receipt;
}

/** Informe de acuses: quién de la audiencia abrió y confirmó el documento. Solo equipo directivo. */
export async function listReceipts(user: AuthUser, id: string) {
  const doc = await findAccessibleDocument(user, id);
  const prisma = getPrisma();
  const audience = audienceOf(doc);
  const [members, receipts] = await Promise.all([
    prisma.membership.findMany({
      where: audienceWhere(user.schoolId, audience),
      select: { role: true, user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    }),
    prisma.documentReceipt.findMany({
      where: { documentId: id },
      select: { userId: true, viewedAt: true, acknowledgedAt: true, ip: true, user: { select: personSelect(user.schoolId) } },
    }),
  ]);
  const byUser = new Map(receipts.map((r) => [r.userId, r]));
  const items = members.map((m) => {
    const r = byUser.get(m.user.id);
    return {
      user: { ...m.user, role: m.role },
      inAudience: true,
      viewedAt: r?.viewedAt ?? null,
      acknowledgedAt: r?.acknowledgedAt ?? null,
      ip: r?.ip ?? null,
    };
  });
  // Acuses de personas que ya no están en la audiencia (p. ej. se cambió la visibilidad): se conservan.
  const inAudience = new Set(members.map((m) => m.user.id));
  for (const r of receipts) {
    if (inAudience.has(r.userId)) continue;
    items.push({ user: toPerson(r.user), inAudience: false, viewedAt: r.viewedAt, acknowledgedAt: r.acknowledgedAt, ip: r.ip });
  }
  return {
    requiresAcknowledgement: doc.requiresAcknowledgement,
    summary: {
      audience: members.length,
      viewed: items.filter((i) => i.inAudience && i.viewedAt).length,
      acknowledged: items.filter((i) => i.inAudience && i.acknowledgedAt).length,
    },
    items,
  };
}

export async function updateDocument(user: AuthUser, id: string, input: UpdateDocumentInput, ctx: RequestContext = {}) {
  const doc = await findAccessibleDocument(user, id);
  if (!canEditDocument(user, doc)) throw forbidden('Solo puedes editar los documentos que subiste');
  if (input.documentTypeId) await assertDocumentType(input.documentTypeId);
  if (input.recipientIds) await assertRecipients(user.schoolId, input.recipientIds);
  if (input.courseIds) await assertCourses(user.schoolId, input.courseIds);

  const updated = await getPrisma().$transaction(async (tx) => {
    if (input.visibleRoles) {
      await tx.documentVisibility.deleteMany({ where: { documentId: id } });
      await tx.documentVisibility.createMany({
        data: [...new Set(input.visibleRoles)].map((role) => ({ documentId: id, role })),
      });
    }
    if (input.recipientIds) {
      await tx.documentRecipient.deleteMany({ where: { documentId: id } });
      await tx.documentRecipient.createMany({
        data: [...new Set(input.recipientIds)].map((userId) => ({ documentId: id, userId })),
      });
    }
    if (input.courseIds) {
      await tx.documentCourse.deleteMany({ where: { documentId: id } });
      await tx.documentCourse.createMany({
        data: [...new Set(input.courseIds)].map((courseId) => ({ documentId: id, courseId })),
      });
    }
    return tx.document.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        documentTypeId: input.documentTypeId,
        folioNumber: input.folioNumber,
        documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00.000Z`) : undefined,
        status: input.status,
        requiresAcknowledgement: input.requiresAcknowledgement,
      },
      include: documentInclude(user),
    });
  });
  // Cambios de audiencia y estado quedan con su valor anterior: es lo que se discute ante un reclamo.
  await recordAudit({
    action: 'document.updated',
    schoolId: user.schoolId,
    actorId: user.id,
    targetType: 'document',
    targetId: id,
    metadata: {
      fields: Object.keys(input),
      before: { status: doc.status, audience: audienceOf(doc) },
      after: { status: updated.status, audience: audienceOf(updated) },
    },
    ip: ctx.ip,
  });
  if (input.visibleRoles || input.recipientIds || input.courseIds || input.status) await notifyNewAudience(user, updated);
  return toDto(updated, user);
}

/** Borrado lógico: el archivo se conserva en S3 (versionado) por trazabilidad. */
export async function deleteDocument(user: AuthUser, id: string, ctx: RequestContext = {}): Promise<void> {
  if (!canDeleteDocument(user)) throw forbidden();
  const doc = await findAccessibleDocument(user, id);
  await getPrisma().document.update({ where: { id }, data: { isDeleted: true } });
  await recordAudit({
    action: 'document.deleted',
    schoolId: user.schoolId,
    actorId: user.id,
    targetType: 'document',
    targetId: id,
    metadata: { title: doc.title },
    ip: ctx.ip,
  });
}

export async function createDownloadUrl(
  user: AuthUser,
  id: string,
  disposition: 'attachment' | 'inline',
  ctx: RequestContext = {},
) {
  const doc = await findAccessibleDocument(user, id);
  await markViewed(user, doc, ctx);
  const ip = ctx.ip;
  const url = await s3.createDownloadUrl(doc.s3Key, doc.fileName, disposition);
  // La vista previa (inline) no cuenta como descarga en el registro.
  if (disposition === 'attachment') {
    await getPrisma().downloadLog.create({ data: { documentId: doc.id, userId: user.id, ip: ip ?? null } });
  }
  return { url, fileName: doc.fileName, mimeType: doc.mimeType, expiresIn: s3.DOWNLOAD_URL_TTL_SECONDS };
}

export async function listDownloads(user: AuthUser, id: string) {
  await findAccessibleDocument(user, id);
  const logs = await getPrisma().downloadLog.findMany({
    where: { documentId: id },
    orderBy: { downloadedAt: 'desc' },
    take: 200,
    include: { user: { select: personSelect(user.schoolId) } },
  });
  return logs.map((l) => ({ id: l.id, downloadedAt: l.downloadedAt, ip: l.ip, user: toPerson(l.user) }));
}

/** Contadores por tipo para el inicio del equipo directivo. */
export async function getStats(user: AuthUser) {
  const prisma = getPrisma();
  const [types, grouped] = await Promise.all([
    prisma.documentType.findMany({ orderBy: { id: 'asc' } }),
    prisma.document.groupBy({ by: ['documentTypeId'], where: visibleDocumentsWhere(user), _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((g) => [g.documentTypeId, g._count._all]));
  const byType = types.map((t) => ({ id: t.id, code: t.code, name: t.name, count: counts.get(t.id) ?? 0 }));
  return { total: byType.reduce((acc, t) => acc + t.count, 0), byType };
}
