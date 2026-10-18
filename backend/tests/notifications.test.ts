/**
 * Notificaciones (bandeja, correo y push por outbox) y acuses de recibo.
 * Transportes "log": los mensajes quedan en sentEmails / sentPushes en lugar de enviarse.
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import request from 'supertest';
import { getPrisma } from '../src/lib/prisma';
import * as transports from '../src/modules/notifications/transports';
import { MAX_ATTEMPTS, processDeliveries } from '../src/modules/notifications/notifications.service';
import { auth, buildApp, closeDatabase, documentIdByFolio, emailOf, resetDatabase, tokenFor, userId } from './helpers';

const app = buildApp();
const s3Mock = mockClient(S3Client);
const { sentEmails, sentPushes } = transports;

beforeAll(resetDatabase);
afterAll(closeDatabase);
beforeEach(() => {
  transports.resetTransports();
  s3Mock.reset();
});
afterEach(() => jest.restoreAllMocks());

async function inbox(key: Parameters<typeof tokenFor>[1]) {
  const res = await request(app).get('/api/v1/notifications').set(auth(await tokenFor(app, key)));
  expect(res.status).toBe(200);
  return res.body as { unread: number; items: { id: string; title: string; body: string; documentId: string }[] };
}

/** Procesa el outbox hasta vaciarlo. */
async function drainOutbox(): Promise<void> {
  for (let i = 0; i < 10; i++) if ((await processDeliveries()).sent === 0) return;
}

describe('avisos al publicar un documento', () => {
  it('avisa a la audiencia (bandeja + correo) y no al autor ni a quienes no corresponde', async () => {
    const token = await tokenFor(app, 'equipo');
    const upload = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(token))
      .send({ fileName: 'reunion.pdf', mimeType: 'application/pdf', fileSize: 1200 });
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 1200 });
    const types = await getPrisma().documentType.findUniqueOrThrow({ where: { code: 'CITACION' } });
    const created = await request(app)
      .post('/api/v1/documents')
      .set(auth(token))
      .send({
        title: 'Reunión de apoderados de octubre',
        description: 'Contenido interno que no debe viajar por correo.',
        documentTypeId: types.id,
        documentDate: '2026-10-20',
        fileName: 'reunion.pdf',
        mimeType: 'application/pdf',
        fileSize: 1200,
        s3Key: upload.body.s3Key,
        visibleRoles: ['apoderado'],
        requiresAcknowledgement: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.requiresAcknowledgement).toBe(true);

    const apoderado = await inbox('apoderado');
    expect(apoderado.unread).toBe(1);
    expect(apoderado.items[0]).toMatchObject({
      title: 'Citación: requiere tu confirmación',
      body: 'Reunión de apoderados de octubre',
      documentId: created.body.id,
    });
    expect((await inbox('apoderado2')).unread).toBe(1);
    expect((await inbox('docente')).unread).toBe(0);
    expect((await inbox('equipo')).unread).toBe(0);

    await drainOutbox();
    const to = sentEmails.map((m) => m.to).sort();
    expect(to).toEqual([emailOf('apoderado'), emailOf('apoderado2')].sort());
    const mail = sentEmails.find((m) => m.to === emailOf('apoderado'))!;
    expect(mail.subject).toBe('Citación: requiere tu confirmación · Colegio Demo RTLCO');
    expect(mail.text).toContain(`https://demo.rtlco.cl/documents/${created.body.id}`);
    expect(mail.text).not.toContain('Contenido interno');
    // Los envíos quedan registrados como enviados: no se repiten.
    await drainOutbox();
    expect(sentEmails).toHaveLength(2);
  });

  it('al ampliar la audiencia solo avisa a quienes no habían recibido aviso', async () => {
    const id = await documentIdByFolio('OF-2026-003');
    const director = await tokenFor(app, 'director');
    await request(app).patch(`/api/v1/documents/${id}`).set(auth(director)).send({ recipientIds: [await userId('docente2')] });
    await request(app)
      .patch(`/api/v1/documents/${id}`)
      .set(auth(director))
      .send({ recipientIds: [await userId('docente2'), await userId('docente')] });
    const notified = await getPrisma().notification.findMany({ where: { documentId: id }, select: { userId: true } });
    expect(notified.map((n) => n.userId).sort()).toEqual([await userId('docente'), await userId('docente2')].sort());
  });

  it('un documento archivado no genera avisos', async () => {
    const id = await documentIdByFolio('MEM-2025-040');
    await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ visibleRoles: ['apoderado'] });
    expect(await getPrisma().notification.count({ where: { documentId: id } })).toBe(0);
  });
});

describe('bandeja de notificaciones', () => {
  it('marca una notificación y todas como leídas, solo las propias', async () => {
    const token = await tokenFor(app, 'apoderado2');
    const { items } = await inbox('apoderado2');
    const other = await tokenFor(app, 'apoderado');
    expect((await request(app).post(`/api/v1/notifications/${items[0]!.id}/read`).set(auth(other))).status).toBe(404);
    expect((await request(app).post(`/api/v1/notifications/${items[0]!.id}/read`).set(auth(token))).status).toBe(204);
    expect((await inbox('apoderado2')).unread).toBe(0);
    const all = await request(app).post('/api/v1/notifications/read-all').set(auth(other));
    expect(all.status).toBe(200);
    expect((await inbox('apoderado')).unread).toBe(0);
  });

  it('respeta la preferencia de no recibir correos', async () => {
    const token = await tokenFor(app, 'docente2');
    const pref = await request(app).patch('/api/v1/notifications/preferences').set(auth(token)).send({ emailNotifications: false });
    expect(pref.body).toEqual({ emailNotifications: false });
    const id = await documentIdByFolio('ACT-2026-005');
    await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ recipientIds: [await userId('docente2')] });
    await drainOutbox();
    expect(sentEmails.map((m) => m.to)).not.toContain(emailOf('docente2'));
    expect((await inbox('docente2')).items.some((n) => n.documentId === id)).toBe(true);
  });
});

describe('push y worker', () => {
  it('registra el dispositivo y envía push; rechaza tokens con formato inválido', async () => {
    const token = await tokenFor(app, 'apoderado');
    const bad = await request(app).post('/api/v1/notifications/push-tokens').set(auth(token)).send({ token: 'abc', platform: 'ios' });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post('/api/v1/notifications/push-tokens')
      .set(auth(token))
      .send({ token: 'ExponentPushToken[abc123]', platform: 'android' });
    expect(ok.status).toBe(204);

    const id = await documentIdByFolio('ACU-2026-002');
    // El acuerdo ya era visible para apoderados (sin avisos previos): un cambio de audiencia los avisa.
    await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ visibleRoles: ['apoderado'] });
    await drainOutbox();
    const push = sentPushes.find((p) => p.tokens.includes('ExponentPushToken[abc123]'));
    expect(push).toMatchObject({ data: { documentId: id, schoolSlug: 'demo' } });
  });

  it('reintenta con espera creciente y marca como fallido tras el máximo de intentos', async () => {
    const id = await documentIdByFolio('MEM-2026-014');
    await request(app).patch(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director'))).send({ recipientIds: [await userId('apoderado2')] });
    jest.spyOn(transports, 'sendEmail').mockRejectedValue(new Error('SES no disponible'));
    const result = await processDeliveries();
    expect(result.failed).toBeGreaterThan(0);
    const delivery = await getPrisma().notificationDelivery.findFirstOrThrow({
      where: { channel: 'email', notification: { documentId: id, userId: await userId('apoderado2') } },
    });
    expect(delivery).toMatchObject({ status: 'pending', attempts: 1, lastError: 'SES no disponible' });
    expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Simula el resto de los intentos.
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await getPrisma().notificationDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(0) } });
      await processDeliveries();
    }
    const final = await getPrisma().notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(final).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('dos workers en paralelo no envían el mismo correo dos veces', async () => {
    const id = await documentIdByFolio('ACT-2026-005');
    await request(app)
      .patch(`/api/v1/documents/${id}`)
      .set(auth(await tokenFor(app, 'director')))
      .send({ visibleRoles: ['docente', 'apoderado'] });
    const pending = await getPrisma().notificationDelivery.count({ where: { status: 'pending', channel: 'email', nextAttemptAt: { lte: new Date() } } });
    expect(pending).toBeGreaterThan(0);
    await Promise.all([processDeliveries(1), processDeliveries(1), processDeliveries(1)]);
    await drainOutbox();
    const recipients = sentEmails.map((m) => m.to);
    expect(new Set(recipients).size).toBe(recipients.length);
  });
});

describe('acuse de recibo', () => {
  it('registra la apertura y la confirmación explícita de la audiencia', async () => {
    const id = await documentIdByFolio('CIT-2026-021');
    const token = await tokenFor(app, 'apoderado');
    const detail = await request(app).get(`/api/v1/documents/${id}`).set(auth(token));
    expect(detail.body.myReceipt).toEqual({ viewedAt: expect.any(String), acknowledgedAt: null });
    expect(detail.body.permissions.canAcknowledge).toBe(true);

    const ack = await request(app).post(`/api/v1/documents/${id}/acknowledge`).set(auth(token));
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedAt).toEqual(expect.any(String));
    // Repetir no cambia la fecha.
    const again = await request(app).post(`/api/v1/documents/${id}/acknowledge`).set(auth(token));
    expect(again.body.acknowledgedAt).toBe(ack.body.acknowledgedAt);
  });

  it('no se confirma lo que no lo requiere, y el equipo directivo no genera acuses', async () => {
    const acuerdo = await documentIdByFolio('ACU-2026-002');
    expect((await request(app).post(`/api/v1/documents/${acuerdo}/acknowledge`).set(auth(await tokenFor(app, 'apoderado')))).status).toBe(400);
    const cit = await documentIdByFolio('CIT-2026-021');
    const director = await tokenFor(app, 'director');
    expect((await request(app).post(`/api/v1/documents/${cit}/acknowledge`).set(auth(director))).status).toBe(400);
    await request(app).get(`/api/v1/documents/${cit}`).set(auth(director));
    expect(await getPrisma().documentReceipt.count({ where: { documentId: cit, userId: await userId('director') } })).toBe(0);
  });

  it('el informe de acuses muestra quién abrió y confirmó; solo para el equipo directivo', async () => {
    const id = await documentIdByFolio('CIT-2026-021');
    expect((await request(app).get(`/api/v1/documents/${id}/receipts`).set(auth(await tokenFor(app, 'apoderado')))).status).toBe(403);
    const res = await request(app).get(`/api/v1/documents/${id}/receipts`).set(auth(await tokenFor(app, 'equipo')));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ audience: 1, viewed: 1, acknowledged: 1 });
    expect(res.body.items[0]).toMatchObject({ user: { fullName: 'Paula Díaz Morales', role: 'apoderado' }, inAudience: true });
  });
});
