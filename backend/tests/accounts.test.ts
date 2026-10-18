/**
 * Recuperación de contraseña, invitaciones, bitácora de auditoría y exportación de datos personales.
 */
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed';
import { getPrisma } from '../src/lib/prisma';
import { computeRutDv } from '../src/lib/rut';
import { processOutboundEmails } from '../src/modules/notifications/notifications.service';
import { resetTransports, sentEmails } from '../src/modules/notifications/transports';
import { auth, buildApp, closeDatabase, emailOf, resetDatabase, tokenFor, userId } from './helpers';

const app = buildApp();

beforeAll(resetDatabase);
afterAll(closeDatabase);
beforeEach(resetTransports);

/** Último enlace enviado a un correo (tras procesar el outbox). */
async function lastLinkTokenFor(email: string): Promise<string> {
  await processOutboundEmails();
  const mail = [...sentEmails].reverse().find((m) => m.to === email);
  if (!mail) throw new Error(`No se envió correo a ${email}`);
  const match = /reset-password\?token=([\w-]+)/.exec(mail.text);
  if (!match) throw new Error('El correo no trae enlace');
  return match[1]!;
}

const login = (email: string, password: string, school = 'demo') =>
  request(app).post('/api/v1/auth/login').set('X-School', school).send({ email, password });

describe('recuperación de contraseña', () => {
  it('responde igual exista o no la cuenta, y solo envía correo a cuentas con acceso al colegio', async () => {
    const known = await request(app).post('/api/v1/auth/password/forgot').send({ email: emailOf('apoderado2') });
    const unknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'nadie@rtlco.cl' });
    // directorNorte no pertenece al colegio demo.
    const otherSchool = await request(app).post('/api/v1/auth/password/forgot').send({ email: emailOf('directorNorte') });
    expect([known.status, unknown.status, otherSchool.status]).toEqual([204, 204, 204]);
    await processOutboundEmails();
    expect(sentEmails.map((m) => m.to)).toEqual([emailOf('apoderado2')]);
    expect(sentEmails[0]!.text).toContain('https://demo.rtlco.cl/reset-password?token=');
  });

  it('cambia la contraseña con el enlace, cierra las sesiones y el enlace no se reutiliza', async () => {
    const oldSession = await login(emailOf('apoderado2'), SEED_PASSWORD);
    const cookie = (oldSession.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await request(app).post('/api/v1/auth/password/forgot').send({ email: emailOf('apoderado2') });
    const token = await lastLinkTokenFor(emailOf('apoderado2'));

    const info = await request(app).get(`/api/v1/auth/password/token?token=${token}`);
    expect(info.body).toEqual({ purpose: 'reset', fullName: 'Rodrigo Pérez Castro', email: emailOf('apoderado2') });

    const weak = await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'corta' });
    expect(weak.status).toBe(400);
    const ok = await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'NuevaClave2026' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ purpose: 'reset' });

    expect((await login(emailOf('apoderado2'), 'NuevaClave2026')).status).toBe(200);
    expect((await login(emailOf('apoderado2'), SEED_PASSWORD)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'OtraClave2026' })).status).toBe(400);
  });

  it('un enlace nuevo invalida el anterior, y un enlace vencido no sirve', async () => {
    await request(app).post('/api/v1/auth/password/forgot').send({ email: emailOf('docente2') });
    const first = await lastLinkTokenFor(emailOf('docente2'));
    await request(app).post('/api/v1/auth/password/forgot').send({ email: emailOf('docente2') });
    const second = await lastLinkTokenFor(emailOf('docente2'));
    expect((await request(app).get(`/api/v1/auth/password/token?token=${first}`)).status).toBe(400);
    expect((await request(app).get(`/api/v1/auth/password/token?token=${second}`)).status).toBe(200);

    await getPrisma().accountToken.updateMany({ where: { userId: await userId('docente2'), usedAt: null }, data: { expiresAt: new Date(0) } });
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token: second, password: 'NuevaClave2026' })).status).toBe(400);
  });
});

describe('invitaciones', () => {
  it('un alta sin contraseña envía invitación; al aceptarla la persona puede entrar', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(await tokenFor(app, 'director')))
      .send({ fullName: 'Tomás Herrera Vega', rut: `21222333-${computeRutDv('21222333')}`, email: 'therrera@colegio.cl', role: 'docente' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ existingAccount: false, invitationSent: true });

    const token = await lastLinkTokenFor('therrera@colegio.cl');
    const mail = sentEmails.find((m) => m.to === 'therrera@colegio.cl')!;
    expect(mail.subject).toBe('Te damos la bienvenida a RTLCO · Colegio Demo RTLCO');
    expect(mail.text).toContain('Código del colegio en la app: demo');

    const accepted = await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'MiClave2026' });
    expect(accepted.body).toEqual({ purpose: 'invite' });
    expect((await login('therrera@colegio.cl', 'MiClave2026')).status).toBe(200);
  });

  it('se puede reenviar la invitación', async () => {
    const id = (await getPrisma().user.findUniqueOrThrow({ where: { email: 'therrera@colegio.cl' } })).id;
    const res = await request(app).post(`/api/v1/users/${id}/invite`).set(auth(await tokenFor(app, 'director')));
    expect(res.status).toBe(204);
    await processOutboundEmails();
    expect(sentEmails.filter((m) => m.to === 'therrera@colegio.cl')).toHaveLength(1);
  });
});

describe('bitácora de auditoría', () => {
  it('registra inicios de sesión, fallidos y altas, sin guardar contraseñas', async () => {
    await login(emailOf('docente'), 'incorrecta123');
    const res = await request(app).get('/api/v1/audit?pageSize=200').set(auth(await tokenFor(app, 'director')));
    expect(res.status).toBe(200);
    const actions = (res.body.items as { action: string }[]).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'auth.login_failed', 'auth.password_reset', 'auth.invitation_accepted', 'user.created']));
    const failed = (res.body.items as { action: string; metadata: unknown }[]).find((e) => e.action === 'auth.login_failed')!;
    expect(failed.metadata).toEqual({ email: emailOf('docente') });
    expect(JSON.stringify(res.body)).not.toMatch(/MiClave2026|NuevaClave2026/);
  });

  it('registra los cambios de audiencia de un documento con su valor anterior', async () => {
    const doc = await getPrisma().document.findFirstOrThrow({ where: { folioNumber: 'OF-2026-003' } });
    await request(app).patch(`/api/v1/documents/${doc.id}`).set(auth(await tokenFor(app, 'director'))).send({ visibleRoles: ['docente'] });
    const res = await request(app).get(`/api/v1/audit?action=document&targetId=${doc.id}`).set(auth(await tokenFor(app, 'director')));
    expect(res.body.items[0]).toMatchObject({
      action: 'document.updated',
      actor: { fullName: 'Marcela Rojas Fuentes' },
      metadata: { before: { audience: { visibleRoles: [] } }, after: { audience: { visibleRoles: ['docente'] } } },
    });
  });

  it('solo dirección y sostenedor la consultan, y cada colegio ve solo la suya', async () => {
    expect((await request(app).get('/api/v1/audit').set(auth(await tokenFor(app, 'equipo')))).status).toBe(403);
    const norte = await request(app)
      .post('/api/v1/auth/login')
      .set('X-School', 'demo-norte')
      .send({ email: emailOf('directorNorte'), password: SEED_PASSWORD });
    const res = await request(app).get('/api/v1/audit?pageSize=200').set('X-School', 'demo-norte').set(auth(norte.body.accessToken));
    expect((res.body.items as { schoolId: string }[]).every((e) => e.schoolId === norte.body.user.school.id)).toBe(true);
  });
});

describe('exportación de datos personales', () => {
  it('entrega los datos de la persona en JSON, sin contraseñas ni datos de terceros', async () => {
    const res = await request(app).get('/api/v1/privacy/export').set(auth(await tokenFor(app, 'apoderado')));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/mis-datos-rtlco-\d{4}-\d{2}-\d{2}\.json/);
    expect(res.body.profile).toMatchObject({ email: emailOf('apoderado'), memberships: [expect.objectContaining({ role: 'apoderado' })] });
    expect(res.body.students).toEqual([expect.objectContaining({ fullName: 'Tomás Díaz Díaz', course: '5° Básico A' })]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    expect(await getPrisma().auditEvent.count({ where: { action: 'data.exported', actorId: await userId('apoderado') } })).toBe(1);
  });
});
