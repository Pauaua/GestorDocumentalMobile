/**
 * Datos iniciales de demostración de RTLCO (idempotente: se puede ejecutar varias veces).
 * - Los 6 tipos de documento
 * - Una red (Red Educacional Demo) con dos colegios: demo y demo-norte
 * - Un usuario de prueba por rol (+ un segundo docente y apoderado para probar permisos)
 *   · el sostenedor administra la red completa (sin membresía directa)
 *   · Felipe Soto es docente en los dos colegios (una cuenta, dos membresías)
 *   · admin@rtlco.cl es superadmin de la plataforma
 * - Estudiantes y relación apoderado-estudiante
 * - Documentos de ejemplo con distintas visibilidades (y su PDF en S3/MinIO)
 */
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { DocumentStatus, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../src/config/env';
import { computeRutDv } from '../src/lib/rut';
import { getS3Client } from '../src/lib/s3';

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Rtlco2026';

const rut = (body: string) => `${body}-${computeRutDv(body)}`;

export const DOCUMENT_TYPES = [
  { code: 'MEMO', name: 'Memo' },
  { code: 'OFICIO', name: 'Oficio' },
  { code: 'CITACION', name: 'Citación' },
  { code: 'ACUERDO', name: 'Acuerdo' },
  { code: 'ACTA', name: 'Acta' },
  { code: 'PERMISO_ADMINISTRATIVO', name: 'Permiso administrativo' },
] as const;

export const SEED_ORGANIZATION = { name: 'Red Educacional Demo', rut: rut('76543210') };

export const SEED_SCHOOLS = [
  { key: 'demo', slug: 'demo', name: 'Colegio Demo RTLCO', rbd: '99901', primaryColor: '#C3B1E8' },
  { key: 'norte', slug: 'demo-norte', name: 'Colegio Demo Norte', rbd: '99902', primaryColor: '#9FD3C7' },
] as const;

type SchoolKey = (typeof SEED_SCHOOLS)[number]['key'];

/** Colegio que usan los tests y el desarrollo local por defecto. */
export const DEFAULT_SCHOOL_SLUG = SEED_SCHOOLS[0].slug;

interface SeedUser {
  key: string;
  fullName: string;
  rut: string;
  email: string;
  phone: string | null;
  memberships: readonly { school: SchoolKey; role: Role }[];
  organizationAdmin?: boolean;
  platformAdmin?: boolean;
}

export const SEED_USERS = [
  { key: 'director', fullName: 'Marcela Rojas Fuentes', rut: rut('12345678'), email: 'director@rtlco.cl', phone: '+56 9 8765 4321', memberships: [{ school: 'demo', role: Role.director }] },
  { key: 'sostenedor', fullName: 'Jorge Contreras Vidal', rut: rut('9876543'), email: 'sostenedor@rtlco.cl', phone: '+56 9 7654 3210', memberships: [], organizationAdmin: true },
  { key: 'equipo', fullName: 'Carolina Muñoz Araya', rut: rut('15432876'), email: 'utp@rtlco.cl', phone: '+56 9 6543 2109', memberships: [{ school: 'demo', role: Role.equipo_directivo }] },
  { key: 'docente', fullName: 'Felipe Soto Valenzuela', rut: rut('16789234'), email: 'docente@rtlco.cl', phone: '+56 9 5432 1098', memberships: [{ school: 'demo', role: Role.docente }, { school: 'norte', role: Role.docente }] },
  { key: 'docente2', fullName: 'Andrea Pizarro Leiva', rut: rut('17654321'), email: 'docente2@rtlco.cl', phone: null, memberships: [{ school: 'demo', role: Role.docente }] },
  { key: 'apoderado', fullName: 'Paula Díaz Morales', rut: rut('14567890'), email: 'apoderado@rtlco.cl', phone: '+56 9 4321 0987', memberships: [{ school: 'demo', role: Role.apoderado }] },
  { key: 'apoderado2', fullName: 'Rodrigo Pérez Castro', rut: rut('13579246'), email: 'apoderado2@rtlco.cl', phone: null, memberships: [{ school: 'demo', role: Role.apoderado }] },
  { key: 'directorNorte', fullName: 'Ignacio Fuentes Lagos', rut: rut('11223344'), email: 'director.norte@rtlco.cl', phone: null, memberships: [{ school: 'norte', role: Role.director }] },
  { key: 'plataforma', fullName: 'Equipo RTLCO', rut: rut('10000001'), email: 'admin@rtlco.cl', phone: null, memberships: [], platformAdmin: true },
] as const satisfies readonly SeedUser[];

type UserKey = (typeof SEED_USERS)[number]['key'];

const STUDENTS: { school: SchoolKey; rut: string; fullName: string; course: string; guardian: UserKey }[] = [
  { school: 'demo', rut: rut('24123456'), fullName: 'Tomás Díaz Díaz', course: '5° Básico A', guardian: 'apoderado' },
  { school: 'demo', rut: rut('25234567'), fullName: 'Sofía Pérez Rivas', course: '3° Básico B', guardian: 'apoderado2' },
];

interface SeedDocument {
  school: SchoolKey;
  s3Key: string;
  title: string;
  description: string;
  type: (typeof DOCUMENT_TYPES)[number]['code'];
  folio: string;
  date: string;
  author: UserKey;
  status?: DocumentStatus;
  requiresAcknowledgement?: boolean;
  visibleRoles: Role[];
  recipients: UserKey[];
}

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    school: 'demo',
    s3Key: 'seed/memo-calendario-evaluaciones.pdf',
    title: 'Calendario de evaluaciones primer semestre',
    description: 'Fechas de evaluaciones sumativas por nivel para el primer semestre 2026.',
    type: 'MEMO', folio: 'MEM-2026-014', date: '2026-03-09', author: 'equipo',
    visibleRoles: [Role.docente], recipients: [],
  },
  {
    school: 'demo',
    s3Key: 'seed/oficio-seremi-infraestructura.pdf',
    title: 'Oficio a SEREMI por mejoras de infraestructura',
    description: 'Solicitud de recursos para reparación de techumbre del gimnasio.',
    type: 'OFICIO', folio: 'OF-2026-003', date: '2026-04-02', author: 'director',
    visibleRoles: [], recipients: [],
  },
  {
    school: 'demo',
    s3Key: 'seed/citacion-apoderado-5a.pdf',
    title: 'Citación a reunión con apoderada de 5° Básico A',
    description: 'Reunión con profesor jefe para revisar el avance académico del estudiante.',
    type: 'CITACION', folio: 'CIT-2026-021', date: '2026-05-14', author: 'equipo', requiresAcknowledgement: true,
    visibleRoles: [], recipients: ['apoderado'],
  },
  {
    school: 'demo',
    s3Key: 'seed/acuerdo-consejo-escolar-celulares.pdf',
    title: 'Acuerdo del Consejo Escolar sobre uso de celulares',
    description: 'Normas de uso de dispositivos móviles en sala de clases.',
    type: 'ACUERDO', folio: 'ACU-2026-002', date: '2026-03-28', author: 'director',
    visibleRoles: [Role.docente, Role.apoderado], recipients: [],
  },
  {
    school: 'demo',
    s3Key: 'seed/acta-consejo-profesores-marzo.pdf',
    title: 'Acta del consejo de profesores de marzo',
    description: 'Acuerdos pedagógicos y planificación del plan lector.',
    type: 'ACTA', folio: 'ACT-2026-005', date: '2026-03-31', author: 'equipo',
    visibleRoles: [Role.docente], recipients: [],
  },
  {
    school: 'demo',
    s3Key: 'seed/permiso-administrativo-fsoto.pdf',
    title: 'Permiso administrativo de Felipe Soto',
    description: 'Autorización de un día de permiso administrativo con goce de remuneraciones.',
    type: 'PERMISO_ADMINISTRATIVO', folio: 'PA-2026-011', date: '2026-06-03', author: 'director',
    visibleRoles: [], recipients: ['docente'],
  },
  {
    school: 'demo',
    s3Key: 'seed/memo-horario-invierno-2025.pdf',
    title: 'Horario de invierno 2025',
    description: 'Memo archivado del año anterior.',
    type: 'MEMO', folio: 'MEM-2025-040', date: '2025-06-20', author: 'director', status: DocumentStatus.ARCHIVADO,
    visibleRoles: [Role.docente, Role.apoderado], recipients: [],
  },
  {
    school: 'norte',
    s3Key: 'seed/demo-norte/memo-bienvenida-docentes.pdf',
    title: 'Bienvenida a docentes del Colegio Demo Norte',
    description: 'Calendario de inducción y protocolo de inicio de año.',
    type: 'MEMO', folio: 'MEM-N-2026-001', date: '2026-03-02', author: 'directorNorte',
    visibleRoles: [Role.docente], recipients: [],
  },
];

/** Genera un PDF mínimo válido con el título del documento. */
export function buildSamplePdf(schoolName: string, title: string): Buffer {
  const ascii = `${schoolName} - ${title}`.normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '');
  const stream = `BT /F1 14 Tf 60 760 Td (${ascii}) Tj 0 -24 Td /F1 10 Tf (Documento de ejemplo generado por el seed.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export async function seed(prisma: PrismaClient, options: { uploadFiles: boolean }): Promise<void> {
  for (const t of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({ where: { code: t.code }, update: { name: t.name }, create: t });
  }
  const types = new Map((await prisma.documentType.findMany()).map((t) => [t.code, t.id]));

  const organization = await prisma.organization.upsert({
    where: { rut: SEED_ORGANIZATION.rut },
    update: { name: SEED_ORGANIZATION.name },
    create: SEED_ORGANIZATION,
  });
  const schools = new Map<SchoolKey, { id: string; name: string }>();
  for (const { key, ...data } of SEED_SCHOOLS) {
    const saved = await prisma.school.upsert({
      where: { slug: data.slug },
      update: { name: data.name, primaryColor: data.primaryColor, organizationId: organization.id },
      create: { ...data, organizationId: organization.id },
    });
    schools.set(key, saved);
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const users = new Map<UserKey, string>();
  for (const u of SEED_USERS as readonly SeedUser[]) {
    const isPlatformAdmin = u.platformAdmin ?? false;
    const saved = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, isPlatformAdmin },
      create: { fullName: u.fullName, rut: u.rut, email: u.email, phone: u.phone, isPlatformAdmin, passwordHash },
    });
    users.set(u.key as UserKey, saved.id);
    for (const m of u.memberships) {
      const schoolId = schools.get(m.school)!.id;
      await prisma.membership.upsert({
        where: { userId_schoolId: { userId: saved.id, schoolId } },
        update: { role: m.role },
        create: { userId: saved.id, schoolId, role: m.role },
      });
    }
    if (u.organizationAdmin) {
      await prisma.organizationAdmin.upsert({
        where: { userId_organizationId: { userId: saved.id, organizationId: organization.id } },
        update: {},
        create: { userId: saved.id, organizationId: organization.id },
      });
    }
  }

  for (const s of STUDENTS) {
    const schoolId = schools.get(s.school)!.id;
    const course = await prisma.course.upsert({
      where: { schoolId_name: { schoolId, name: s.course } },
      update: {},
      create: { schoolId, name: s.course },
    });
    const student = await prisma.student.upsert({
      where: { schoolId_rut: { schoolId, rut: s.rut } },
      update: { fullName: s.fullName, courseId: course.id },
      create: { schoolId, rut: s.rut, fullName: s.fullName, courseId: course.id },
    });
    const guardianId = users.get(s.guardian)!;
    await prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId, studentId: student.id } },
      update: {},
      create: { guardianId, studentId: student.id },
    });
  }

  for (const d of SEED_DOCUMENTS) {
    const school = schools.get(d.school)!;
    const file = buildSamplePdf(school.name, d.title);
    const data = {
      schoolId: school.id,
      title: d.title,
      description: d.description,
      documentTypeId: types.get(d.type)!,
      folioNumber: d.folio,
      documentDate: new Date(`${d.date}T00:00:00.000Z`),
      authorId: users.get(d.author)!,
      fileName: d.s3Key.split('/').pop()!,
      mimeType: 'application/pdf',
      fileSize: file.length,
      status: d.status ?? DocumentStatus.VIGENTE,
      requiresAcknowledgement: d.requiresAcknowledgement ?? false,
    };
    const doc = await prisma.document.upsert({
      where: { s3Key: d.s3Key },
      update: data,
      create: { ...data, s3Key: d.s3Key },
    });
    await prisma.documentVisibility.deleteMany({ where: { documentId: doc.id } });
    await prisma.documentVisibility.createMany({ data: d.visibleRoles.map((role) => ({ documentId: doc.id, role })) });
    await prisma.documentRecipient.deleteMany({ where: { documentId: doc.id } });
    await prisma.documentRecipient.createMany({
      data: d.recipients.map((key) => ({ documentId: doc.id, userId: users.get(key)! })),
    });

    if (options.uploadFiles) {
      try {
        await getS3Client().send(
          new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: d.s3Key, Body: file, ContentType: 'application/pdf' }),
        );
      } catch (err) {
        console.warn(`No se pudo subir ${d.s3Key} a S3: ${(err as Error).message}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  process.env.S3_BUCKET = config.S3_BUCKET;
  const prisma = new PrismaClient();
  try {
    await seed(prisma, { uploadFiles: process.env.SEED_SKIP_S3 !== 'true' });
    const slugs = SEED_SCHOOLS.map((s) => s.slug).join(', ');
    console.log(`Seed completado (colegios: ${slugs}). Contraseña de los usuarios de prueba: ${SEED_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
