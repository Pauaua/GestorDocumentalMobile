/**
 * Importación masiva (CSV) de personas y de estudiantes con apoderados, y cursos como audiencia.
 */
import request from 'supertest';
import { getPrisma } from '../src/lib/prisma';
import { computeRutDv } from '../src/lib/rut';
import { auth, buildApp, closeDatabase, documentIdByFolio, emailOf, resetDatabase, tokenFor, userId } from './helpers';

const app = buildApp();
const rut = (body: string) => `${body}-${computeRutDv(body)}`;

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function upload(kind: 'people' | 'students', csv: string, query: string, key: Parameters<typeof tokenFor>[1] = 'director') {
  return request(app)
    .post(`/api/v1/imports/${kind}?${query}`)
    .set(auth(await tokenFor(app, key)))
    .set('Content-Type', 'text/csv')
    .send(csv);
}

// Formato de Excel en Chile: BOM, separador ";" y encabezados con mayúsculas y tildes.
const PEOPLE_CSV = [
  '﻿Nombre;RUT;Correo;Rol;Teléfono',
  `Daniela Torres Rojas;${rut('19111222')};dtorres@colegio.cl;Docente;+56 9 1111 2222`,
  `Ignacio Fuentes Lagos;${rut('11223344')};${emailOf('directorNorte')};equipo directivo;`,
  `Felipe Soto Valenzuela;${rut('16789234')};${emailOf('docente')};docente;`,
  `Sin Rut Valido;12345678-0;malo@colegio.cl;docente;`,
  `Rol Inválido;${rut('19222333')};rol@colegio.cl;director;`,
  `"Correo, ajeno";${rut('19333444')};${emailOf('apoderado')};apoderado;`,
  `Daniela Torres Rojas;${rut('19111222')};dtorres@colegio.cl;Docente;+56 9 1111 2222`,
].join('\r\n');

describe('importación de personas', () => {
  it('entrega la plantilla con BOM para Excel', async () => {
    const res = await request(app).get('/api/v1/imports/people/template').set(auth(await tokenFor(app, 'director')));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('plantilla-personas.csv');
    expect(res.text).toBe('﻿nombre;rut;correo;rol;telefono\n');
  });

  it('la vista previa valida fila por fila sin escribir nada', async () => {
    const before = await getPrisma().user.count();
    const res = await upload('people', PEOPLE_CSV, 'dryRun=true');
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ rows: 7, valid: 3, errors: 3, accountsCreated: 1, addedToSchool: 2, invitations: 1 });
    type Row = { line: number; status: string; actions: string[]; errors: string[] };
    const byLine: Record<number, Row> = Object.fromEntries((res.body.rows as Row[]).map((r) => [r.line, r]));
    expect(byLine[2]).toMatchObject({ status: 'ok', actions: ['Se crea la cuenta', 'Se envía invitación por correo'] });
    expect(byLine[3]).toMatchObject({ status: 'ok', actions: ['Cuenta existente: se agrega al colegio'] });
    expect(byLine[4]!.actions[0]).toMatch(/Ya es miembro/);
    expect(byLine[5]).toMatchObject({ status: 'error', errors: [expect.stringContaining('RUT inválido')] });
    expect(byLine[6]).toMatchObject({ status: 'error', errors: [expect.stringContaining('Rol inválido')] });
    expect(byLine[7]).toMatchObject({ status: 'error', errors: ['El correo o el RUT ya pertenecen a otra cuenta'] });
    expect(byLine[8]!.actions[0]).toMatch(/Fila repetida/);
    expect(await getPrisma().user.count()).toBe(before);
  });

  it('importa: crea cuentas, agrega membresías, invita y audita', async () => {
    const res = await upload('people', PEOPLE_CSV, 'dryRun=false');
    expect(res.status).toBe(201);
    expect(res.body.summary.accountsCreated).toBe(1);
    const prisma = getPrisma();
    const daniela = await prisma.user.findUniqueOrThrow({ where: { email: 'dtorres@colegio.cl' }, include: { memberships: true } });
    expect(daniela.memberships).toEqual([expect.objectContaining({ role: 'docente' })]);
    expect(await prisma.membership.count({ where: { userId: await userId('directorNorte') } })).toBe(2);
    expect(await prisma.outboundEmail.count({ where: { to: 'dtorres@colegio.cl' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'import.people' } })).toBe(1);
  });

  it('solo dirección y sostenedor importan; las columnas obligatorias se validan', async () => {
    expect((await upload('people', PEOPLE_CSV, 'dryRun=true', 'equipo')).status).toBe(403);
    const missing = await upload('people', 'nombre;correo\nAna;ana@x.cl', 'dryRun=true');
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('rut');
  });
});

describe('importación de estudiantes y cursos como audiencia', () => {
  const STUDENTS_CSV = [
    'rut_estudiante,nombre_estudiante,curso,rut_apoderado,nombre_apoderado,correo_apoderado,telefono_apoderado,parentesco',
    `${rut('26111222')},Martina Lagos Paz,1° Medio A,${rut('15999888')},Carmen Paz Muñoz,cpaz@familia.cl,,madre`,
    `${rut('26222333')},Benjamín Lagos Paz,1° Medio A,${rut('15999888')},Carmen Paz Muñoz,cpaz@familia.cl,,madre`,
    `${rut('26333444')},Lucas Pérez Rivas,1° Medio A,${rut('13579246')},Rodrigo Pérez Castro,${emailOf('apoderado2')},,padre`,
    `${rut('26333444')},Lucas Repetido,2° Medio B,${rut('13579246')},Rodrigo Pérez Castro,${emailOf('apoderado2')},,padre`,
  ].join('\n');

  it('vista previa y luego importación de cursos, estudiantes y apoderados', async () => {
    const preview = await upload('students', STUDENTS_CSV, 'dryRun=true');
    expect(preview.status).toBe(200);
    expect(preview.body.summary).toMatchObject({ rows: 4, valid: 3, errors: 1, coursesCreated: 1, studentsCreated: 3, accountsCreated: 1, invitations: 1 });
    expect(preview.body.rows[3]).toMatchObject({ status: 'error', errors: [expect.stringContaining('rut_estudiante repetido')] });

    const res = await upload('students', STUDENTS_CSV, 'dryRun=false');
    expect(res.status).toBe(201);
    const prisma = getPrisma();
    const course = await prisma.course.findFirstOrThrow({ where: { name: '1° Medio A' }, include: { students: true } });
    expect(course.students).toHaveLength(3);
    const carmen = await prisma.user.findUniqueOrThrow({ where: { email: 'cpaz@familia.cl' }, include: { students: true, memberships: true } });
    expect(carmen.students).toHaveLength(2);
    expect(carmen.memberships[0]!.role).toBe('apoderado');
    expect(await prisma.outboundEmail.count({ where: { to: 'cpaz@familia.cl' } })).toBe(1);
  });

  it('un documento dirigido a un curso lo ven solo los apoderados de ese curso, que reciben aviso', async () => {
    const course = await getPrisma().course.findFirstOrThrow({ where: { name: '1° Medio A' } });
    const courses = await request(app).get('/api/v1/courses').set(auth(await tokenFor(app, 'equipo')));
    expect(courses.body).toEqual(expect.arrayContaining([{ id: course.id, name: '1° Medio A', students: 3 }]));

    const id = await documentIdByFolio('OF-2026-003');
    const patch = await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ courseIds: [course.id] });
    expect(patch.status).toBe(200);
    expect(patch.body.courses).toEqual([{ id: course.id, name: '1° Medio A' }]);

    const seenBy = async (key: Parameters<typeof tokenFor>[1]) =>
      (await request(app).get(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, key)))).status;
    expect(await seenBy('apoderado2')).toBe(200);
    expect(await seenBy('apoderado')).toBe(403);
    expect(await seenBy('docente')).toBe(403);

    const notified = await getPrisma().notification.findMany({ where: { documentId: id }, select: { userId: true } });
    const carmen = await getPrisma().user.findUniqueOrThrow({ where: { email: 'cpaz@familia.cl' } });
    expect(notified.map((n) => n.userId).sort()).toEqual([await userId('apoderado2'), carmen.id].sort());
  });

  it('rechaza cursos de otro colegio', async () => {
    const other = await getPrisma().course.create({
      data: { name: 'Curso ajeno', school: { connect: { slug: 'demo-norte' } } },
    });
    const id = await documentIdByFolio('OF-2026-003');
    const res = await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ courseIds: [other.id] });
    expect(res.status).toBe(400);
  });

  it('el perfil del apoderado muestra el curso de cada estudiante', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(auth(await tokenFor(app, 'apoderado2')));
    expect(res.body.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fullName: 'Sofía Pérez Rivas', course: '3° Básico B' }),
        expect.objectContaining({ fullName: 'Lucas Pérez Rivas', course: '1° Medio A', relationship: 'padre' }),
      ]),
    );
  });
});
