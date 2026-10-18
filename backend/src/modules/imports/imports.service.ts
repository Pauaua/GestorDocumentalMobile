import { type Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { csvRecords } from '../../lib/csv';
import { badRequest } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { isValidRut, normalizeRut } from '../../lib/rut';
import type { AuthUser } from '../../middleware/auth';
import type { Tenant } from '../../middleware/tenant';
import { sendInvitation } from '../auth/account-tokens';
import { findOrCreateAccount, randomPasswordHash } from '../users/accounts';

export const MAX_ROWS = 2000;

/** Roles importables. Dirección y sostenedor se asignan a mano (son administradores). */
const ROLE_ALIASES: Record<string, Role> = {
  docente: Role.docente,
  profesor: Role.docente,
  profesora: Role.docente,
  equipo_directivo: Role.equipo_directivo,
  equipo: Role.equipo_directivo,
  utp: Role.equipo_directivo,
  apoderado: Role.apoderado,
  apoderada: Role.apoderado,
  apoderado_a: Role.apoderado,
};

const roleAlias = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');

const rut = z.string().min(1, 'Falta el RUT').transform(normalizeRut).refine(isValidRut, 'RUT inválido');
const email = z.email('Correo inválido').transform((v) => v.toLowerCase());
const name = z.string().min(3, 'Nombre demasiado corto').max(120);
const phone = z.string().max(20).optional().transform((v) => v || null);

const personRow = z.object({
  nombre: name,
  rut,
  correo: email,
  rol: z
    .string()
    .transform((v) => ROLE_ALIASES[roleAlias(v)])
    .refine((v): v is Role => !!v, 'Rol inválido (docente, equipo directivo o apoderado)'),
  telefono: phone,
});

const studentRow = z.object({
  rut_estudiante: rut,
  nombre_estudiante: name,
  curso: z.string().min(1, 'Falta el curso').max(60),
  rut_apoderado: rut,
  nombre_apoderado: name,
  correo_apoderado: email,
  telefono_apoderado: phone,
  parentesco: z.string().max(40).optional().transform((v) => v || 'apoderado'),
});

export const TEMPLATES = {
  people: ['nombre', 'rut', 'correo', 'rol', 'telefono'],
  students: [
    'rut_estudiante',
    'nombre_estudiante',
    'curso',
    'rut_apoderado',
    'nombre_apoderado',
    'correo_apoderado',
    'telefono_apoderado',
    'parentesco',
  ],
} as const;

const REQUIRED = {
  people: ['nombre', 'rut', 'correo', 'rol'],
  students: ['rut_estudiante', 'nombre_estudiante', 'curso', 'rut_apoderado', 'nombre_apoderado', 'correo_apoderado'],
} as const;

export type ImportKind = keyof typeof TEMPLATES;

export interface RowResult {
  line: number;
  status: 'ok' | 'error';
  /** Qué se hará (o se hizo) con la fila. */
  actions: string[];
  errors: string[];
}

export interface ImportResult {
  kind: ImportKind;
  dryRun: boolean;
  summary: { rows: number; valid: number; errors: number; accountsCreated: number; addedToSchool: number; invitations: number; studentsCreated?: number; coursesCreated?: number };
  rows: RowResult[];
}

function parseRows<T extends z.ZodType>(kind: ImportKind, csv: string, schema: T) {
  const { headers, records } = csvRecords(csv);
  const missing = REQUIRED[kind].filter((h) => !headers.includes(h));
  if (missing.length > 0) throw badRequest(`Faltan columnas: ${missing.join(', ')}. Usa la plantilla.`);
  if (records.length === 0) throw badRequest('El archivo no tiene filas');
  if (records.length > MAX_ROWS) throw badRequest(`Máximo ${MAX_ROWS} filas por archivo`);
  return records.map((r) => {
    const parsed = schema.safeParse(r.values);
    return parsed.success
      ? { line: r.line, data: parsed.data as z.infer<T>, errors: [] as string[] }
      : { line: r.line, data: null, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  });
}

/** Mismo RUT o correo repetido dentro del archivo con datos distintos: se marca como error. */
function markDuplicates<T>(rows: { line: number; data: T | null; errors: string[] }[], keys: (d: T) => string[]): void {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!row.data) continue;
    const signature = keys(row.data).join('|');
    for (const key of keys(row.data).slice(0, 2)) {
      const prev = seen.get(key);
      if (prev && prev !== signature) row.errors.push(`${key.split(':')[0]} repetido con datos distintos en el archivo`);
      seen.set(key, signature);
    }
  }
}

/**
 * Personas (docentes, equipo directivo, apoderados).
 * Cuenta existente (mismo correo y RUT): solo se agrega al colegio. Nueva: se crea y recibe invitación.
 */
export async function importPeople(user: AuthUser, school: Tenant, csv: string, opts: { dryRun: boolean; invite: boolean; ip?: string }): Promise<ImportResult> {
  const rows = parseRows('people', csv, personRow);
  markDuplicates(rows, (d) => [`rut:${d.rut}`, `correo:${d.correo}`, d.nombre]);
  const prisma = getPrisma();
  const results: RowResult[] = [];
  const summary = { rows: rows.length, valid: 0, errors: 0, accountsCreated: 0, addedToSchool: 0, invitations: 0 };
  const placeholderHash = await randomPasswordHash();
  const seenRuts = new Map<string, number>();

  const run = async (tx: Prisma.TransactionClient) => {
    for (const row of rows) {
      if (!row.data || row.errors.length > 0) {
        results.push({ line: row.line, status: 'error', actions: [], errors: row.errors });
        summary.errors++;
        continue;
      }
      const d = row.data;
      const repeatedAt = seenRuts.get(d.rut);
      if (repeatedAt) {
        results.push({ line: row.line, status: 'ok', actions: [`Fila repetida (igual a la fila ${repeatedAt}): se ignora`], errors: [] });
        continue;
      }
      seenRuts.set(d.rut, row.line);
      const existing = await tx.user.findMany({ where: { OR: [{ email: d.correo }, { rut: d.rut }] }, select: { id: true, email: true, rut: true } });
      const match = existing.find((u) => u.email === d.correo && u.rut === d.rut);
      if (existing.length > 0 && (!match || existing.length > 1)) {
        results.push({ line: row.line, status: 'error', actions: [], errors: ['El correo o el RUT ya pertenecen a otra cuenta'] });
        summary.errors++;
        continue;
      }
      const membership = match
        ? await tx.membership.findUnique({ where: { userId_schoolId: { userId: match.id, schoolId: user.schoolId } } })
        : null;
      const actions: string[] = [];
      summary.valid++;
      if (membership) {
        actions.push(membership.role === d.rol ? 'Ya es miembro: sin cambios' : `Ya es miembro con rol ${membership.role}: no se cambia`);
        results.push({ line: row.line, status: 'ok', actions, errors: [] });
        continue;
      }
      actions.push(match ? 'Cuenta existente: se agrega al colegio' : 'Se crea la cuenta');
      if (!match) summary.accountsCreated++;
      summary.addedToSchool++;
      if (!match && opts.invite) {
        actions.push('Se envía invitación por correo');
        summary.invitations++;
      }
      results.push({ line: row.line, status: 'ok', actions, errors: [] });
      if (opts.dryRun) continue;

      const { userId, needsInvitation } = await findOrCreateAccount(
        tx,
        { fullName: d.nombre, rut: d.rut, email: d.correo, phone: d.telefono },
        { placeholderHash },
      );
      await tx.membership.create({ data: { userId, schoolId: user.schoolId, role: d.rol } });
      if (needsInvitation && opts.invite) await sendInvitation(tx, { id: userId, fullName: d.nombre, email: d.correo }, school);
    }
    if (!opts.dryRun) {
      await recordAudit({ action: 'import.people', schoolId: user.schoolId, actorId: user.id, targetType: 'import', metadata: summary, ip: opts.ip }, tx);
    }
  };

  // La vista previa no escribe; la importación es todo o nada.
  if (opts.dryRun) await run(prisma);
  else await prisma.$transaction(run, { timeout: 120_000, maxWait: 10_000 });
  return { kind: 'people', dryRun: opts.dryRun, summary, rows: results };
}

/**
 * Estudiantes con su apoderado(a): crea los cursos que falten, crea o actualiza al estudiante (por RUT)
 * y vincula al apoderado (creando su cuenta e invitándolo si no existe).
 */
export async function importStudents(user: AuthUser, school: Tenant, csv: string, opts: { dryRun: boolean; invite: boolean; ip?: string }): Promise<ImportResult> {
  const rows = parseRows('students', csv, studentRow);
  // El mismo apoderado puede repetirse (varios hijos); un RUT de estudiante, no.
  markDuplicates(rows, (d) => [`rut_apoderado:${d.rut_apoderado}`, `correo_apoderado:${d.correo_apoderado}`, d.nombre_apoderado]);
  const studentLines = new Map<string, number>();
  for (const row of rows) {
    if (!row.data) continue;
    const prev = studentLines.get(row.data.rut_estudiante);
    if (prev) row.errors.push(`rut_estudiante repetido (fila ${prev})`);
    else studentLines.set(row.data.rut_estudiante, row.line);
  }

  const prisma = getPrisma();
  const results: RowResult[] = [];
  const summary = { rows: rows.length, valid: 0, errors: 0, accountsCreated: 0, addedToSchool: 0, invitations: 0, studentsCreated: 0, coursesCreated: 0 };
  const placeholderHash = await randomPasswordHash();
  const knownCourses = new Map(
    (await prisma.course.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true } })).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const newCourses = new Set<string>();
  const handledGuardians = new Set<string>();

  const run = async (tx: Prisma.TransactionClient) => {
    for (const row of rows) {
      if (!row.data || row.errors.length > 0) {
        results.push({ line: row.line, status: 'error', actions: [], errors: row.errors });
        summary.errors++;
        continue;
      }
      const d = row.data;
      const existing = await tx.user.findMany({
        where: { OR: [{ email: d.correo_apoderado }, { rut: d.rut_apoderado }] },
        select: { id: true, email: true, rut: true },
      });
      const guardian = existing.find((u) => u.email === d.correo_apoderado && u.rut === d.rut_apoderado);
      if (existing.length > 0 && (!guardian || existing.length > 1)) {
        results.push({ line: row.line, status: 'error', actions: [], errors: ['El correo o el RUT del apoderado ya pertenecen a otra cuenta'] });
        summary.errors++;
        continue;
      }
      const actions: string[] = [];
      summary.valid++;

      const courseKey = d.curso.toLowerCase();
      if (!knownCourses.has(courseKey) && !newCourses.has(courseKey)) {
        newCourses.add(courseKey);
        summary.coursesCreated++;
        actions.push(`Se crea el curso ${d.curso}`);
      }
      const student = await tx.student.findUnique({ where: { schoolId_rut: { schoolId: user.schoolId, rut: d.rut_estudiante } } });
      actions.push(student ? 'Estudiante existente: se actualiza nombre y curso' : 'Se crea el estudiante');
      if (!student) summary.studentsCreated++;

      const membership = guardian
        ? await tx.membership.findUnique({ where: { userId_schoolId: { userId: guardian.id, schoolId: user.schoolId } } })
        : null;
      const guardianKey = d.rut_apoderado;
      if (!handledGuardians.has(guardianKey)) {
        handledGuardians.add(guardianKey);
        if (!guardian) {
          summary.accountsCreated++;
          summary.addedToSchool++;
          actions.push('Se crea la cuenta del apoderado');
          if (opts.invite) {
            summary.invitations++;
            actions.push('Se envía invitación por correo');
          }
        } else if (!membership) {
          summary.addedToSchool++;
          actions.push('Apoderado con cuenta existente: se agrega al colegio');
        } else if (membership.role !== Role.apoderado) {
          actions.push(`El apoderado ya es miembro como ${membership.role}: se vincula sin cambiar su rol`);
        }
      }
      results.push({ line: row.line, status: 'ok', actions, errors: [] });
      if (opts.dryRun) continue;

      let courseId = knownCourses.get(courseKey);
      if (!courseId) {
        courseId = (await tx.course.create({ data: { schoolId: user.schoolId, name: d.curso }, select: { id: true } })).id;
        knownCourses.set(courseKey, courseId);
      }
      const saved = await tx.student.upsert({
        where: { schoolId_rut: { schoolId: user.schoolId, rut: d.rut_estudiante } },
        update: { fullName: d.nombre_estudiante, courseId },
        create: { schoolId: user.schoolId, rut: d.rut_estudiante, fullName: d.nombre_estudiante, courseId },
        select: { id: true },
      });
      const { userId, needsInvitation } = await findOrCreateAccount(
        tx,
        { fullName: d.nombre_apoderado, rut: d.rut_apoderado, email: d.correo_apoderado, phone: d.telefono_apoderado },
        { placeholderHash },
      );
      await tx.membership.upsert({
        where: { userId_schoolId: { userId, schoolId: user.schoolId } },
        update: {},
        create: { userId, schoolId: user.schoolId, role: Role.apoderado },
      });
      await tx.guardianStudent.upsert({
        where: { guardianId_studentId: { guardianId: userId, studentId: saved.id } },
        update: { relationship: d.parentesco },
        create: { guardianId: userId, studentId: saved.id, relationship: d.parentesco },
      });
      if (needsInvitation && opts.invite) {
        await sendInvitation(tx, { id: userId, fullName: d.nombre_apoderado, email: d.correo_apoderado }, school);
      }
    }
    if (!opts.dryRun) {
      await recordAudit({ action: 'import.students', schoolId: user.schoolId, actorId: user.id, targetType: 'import', metadata: summary, ip: opts.ip }, tx);
    }
  };

  if (opts.dryRun) await run(prisma);
  else await prisma.$transaction(run, { timeout: 120_000, maxWait: 10_000 });
  return { kind: 'students', dryRun: opts.dryRun, summary, rows: results };
}
