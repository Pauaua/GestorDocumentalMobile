import { DocumentStatus, Role } from '@prisma/client';
import { z } from 'zod';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Tipos de archivo permitidos y sus extensiones válidas. */
export const ALLOWED_MIME_TYPES = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
} as const satisfies Record<string, readonly string[]>;

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TYPES;
const mimeTypes = Object.keys(ALLOWED_MIME_TYPES) as [AllowedMimeType, ...AllowedMimeType[]];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD');

const fileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/[\\/]/.test(v), 'Nombre de archivo inválido');

const fileFields = {
  fileName,
  mimeType: z.enum(mimeTypes, { message: 'Tipo de archivo no permitido (PDF, DOCX, JPG o PNG)' }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, 'El archivo supera el máximo de 10 MB'),
};

function extensionMatches(data: { fileName: string; mimeType: AllowedMimeType }): boolean {
  const ext = data.fileName.split('.').pop()?.toLowerCase() ?? '';
  return (ALLOWED_MIME_TYPES[data.mimeType] as readonly string[]).includes(ext);
}

export const uploadUrlSchema = z
  .object(fileFields)
  .refine(extensionMatches, { message: 'La extensión no coincide con el tipo de archivo', path: ['fileName'] });

const visibleRoles = z.array(z.enum(Role)).max(5);
const recipientIds = z.array(z.uuid()).max(500);
const courseIds = z.array(z.uuid()).max(100);
const audience = {
  visibleRoles: visibleRoles.default([]),
  recipientIds: recipientIds.default([]),
  courseIds: courseIds.default([]),
};

const metadata = {
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  documentTypeId: z.number().int().positive(),
  folioNumber: z.string().trim().max(50).optional().nullable(),
  documentDate: isoDate,
};

export const createDocumentSchema = z
  .object({
    ...metadata,
    ...fileFields,
    ...audience,
    requiresAcknowledgement: z.boolean().default(false),
    s3Key: z.string().min(1).max(512),
  })
  .refine(extensionMatches, { message: 'La extensión no coincide con el tipo de archivo', path: ['fileName'] });

export const updateDocumentSchema = z
  .object({
    title: metadata.title.optional(),
    description: metadata.description,
    documentTypeId: metadata.documentTypeId.optional(),
    folioNumber: metadata.folioNumber,
    documentDate: isoDate.optional(),
    status: z.enum(DocumentStatus).optional(),
    visibleRoles: visibleRoles.optional(),
    recipientIds: recipientIds.optional(),
    courseIds: courseIds.optional(),
    requiresAcknowledgement: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar' });

export const listDocumentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  typeId: z.coerce.number().int().positive().optional(),
  type: z.string().trim().max(50).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  authorId: z.uuid().optional(),
  status: z.enum(DocumentStatus).optional(),
  q: z.string().trim().max(100).optional(),
});

export const downloadUrlSchema = z.object({
  disposition: z.enum(['attachment', 'inline']).default('attachment'),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
