import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import request from 'supertest';
import { getPrisma } from '../src/lib/prisma';
import { auth, buildApp, closeDatabase, resetDatabase, schoolId, tokenFor, userId } from './helpers';

const app = buildApp();
const s3Mock = mockClient(S3Client);

beforeAll(resetDatabase);
afterAll(closeDatabase);
beforeEach(() => s3Mock.reset());

async function documentTypeId(code: string): Promise<number> {
  return (await getPrisma().documentType.findUniqueOrThrow({ where: { code } })).id;
}

describe('flujo de subida con presigned URL', () => {
  it('entrega una URL PUT firmada con el tipo de contenido y bajo el prefijo del colegio y del usuario', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(await tokenFor(app, 'director')))
      .send({ fileName: 'Acta reunión N°3.pdf', mimeType: 'application/pdf', fileSize: 2048 });
    expect(res.status).toBe(201);
    expect(res.body.s3Key).toMatch(new RegExp(`^schools/${await schoolId('demo')}/documents/${await userId('director')}/\\d{4}/\\d{2}/.+-Acta_reunion_N_3\\.pdf$`));
    expect(res.body.uploadUrl).toContain('X-Amz-Signature=');
    expect(res.body.uploadUrl).toContain('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost');
    expect(res.body.headers).toEqual({ 'Content-Type': 'application/pdf' });
  });

  it.each([
    [{ fileName: 'virus.exe', mimeType: 'application/x-msdownload', fileSize: 100 }, 'tipo no permitido'],
    [{ fileName: 'grande.pdf', mimeType: 'application/pdf', fileSize: 10 * 1024 * 1024 + 1 }, 'más de 10 MB'],
    [{ fileName: 'foto.pdf', mimeType: 'image/png', fileSize: 100 }, 'extensión distinta al tipo'],
  ])('rechaza %j (%s)', async (body) => {
    const res = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(await tokenFor(app, 'director')))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('registra el documento con metadatos, visibilidad y destinatarios tras verificar el objeto en S3', async () => {
    const token = await tokenFor(app, 'equipo');
    const upload = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(token))
      .send({ fileName: 'citacion.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 5000 });
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 5000, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const apoderado2 = await userId('apoderado2');
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth(token))
      .send({
        title: 'Citación por convivencia escolar',
        description: 'Reunión con inspectoría general.',
        documentTypeId: await documentTypeId('CITACION'),
        folioNumber: 'CIT-2026-099',
        documentDate: '2026-09-20',
        s3Key: upload.body.s3Key,
        fileName: 'citacion.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 5000,
        visibleRoles: [],
        recipientIds: [apoderado2],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Citación por convivencia escolar',
      documentType: { code: 'CITACION' },
      documentDate: '2026-09-20',
      status: 'VIGENTE',
      recipients: [expect.objectContaining({ id: apoderado2 })],
    });
    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);

    // Metadatos persistidos en PostgreSQL.
    const stored = await getPrisma().document.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.s3Key).toBe(upload.body.s3Key);
    expect(stored.authorId).toBe(await userId('equipo'));

    // Solo el destinatario (entre los apoderados) lo ve.
    const asRecipient = await request(app).get(`/api/v1/documents/${res.body.id}`).set(auth(await tokenFor(app, 'apoderado2')));
    expect(asRecipient.status).toBe(200);
    const asOther = await request(app).get(`/api/v1/documents/${res.body.id}`).set(auth(await tokenFor(app, 'apoderado')));
    expect(asOther.status).toBe(403);
  });

  it('rechaza registrar un archivo que no está en S3', async () => {
    const token = await tokenFor(app, 'director');
    const upload = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(token))
      .send({ fileName: 'x.png', mimeType: 'image/png', fileSize: 10 });
    s3Mock.on(HeadObjectCommand).rejects(Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth(token))
      .send({
        title: 'Imagen', documentTypeId: await documentTypeId('MEMO'), documentDate: '2026-09-01',
        s3Key: upload.body.s3Key, fileName: 'x.png', mimeType: 'image/png', fileSize: 10,
      });
    expect(res.status).toBe(400);
  });

  it('impide registrar una clave S3 subida por otro usuario', async () => {
    const director = await userId('director');
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth(await tokenFor(app, 'sostenedor')))
      .send({
        title: 'Robo de clave', documentTypeId: await documentTypeId('MEMO'), documentDate: '2026-09-01',
        s3Key: `documents/${director}/2026/09/abc-x.pdf`, fileName: 'x.pdf', mimeType: 'application/pdf', fileSize: 10,
      });
    expect(res.status).toBe(403);
  });
});

describe('búsqueda, filtros y paginación', () => {
  it('filtra por texto sin distinguir mayúsculas', async () => {
    const res = await request(app).get('/api/v1/documents?q=CELULARES').set(auth(await tokenFor(app, 'director')));
    expect(res.body.items.map((d: { folioNumber: string }) => d.folioNumber)).toEqual(['ACU-2026-002']);
  });

  it('filtra por tipo y rango de fechas', async () => {
    const token = await tokenFor(app, 'director');
    const byType = await request(app).get('/api/v1/documents?type=MEMO').set(auth(token));
    expect(byType.body.items.every((d: { documentType: { code: string } }) => d.documentType.code === 'MEMO')).toBe(true);
    const byDate = await request(app).get('/api/v1/documents?dateFrom=2026-03-01&dateTo=2026-03-31').set(auth(token));
    expect(byDate.body.items.map((d: { folioNumber: string }) => d.folioNumber).sort()).toEqual(['ACT-2026-005', 'ACU-2026-002', 'MEM-2026-014']);
  });

  it('filtra por estado y autor', async () => {
    const token = await tokenFor(app, 'director');
    const archived = await request(app).get('/api/v1/documents?status=ARCHIVADO').set(auth(token));
    expect(archived.body.items.map((d: { folioNumber: string }) => d.folioNumber)).toEqual(['MEM-2025-040']);
    const byAuthor = await request(app).get(`/api/v1/documents?authorId=${await userId('equipo')}`).set(auth(token));
    expect(byAuthor.body.items.every((d: { author: { fullName: string } }) => d.author.fullName === 'Carolina Muñoz Araya')).toBe(true);
  });

  it('pagina los resultados', async () => {
    const token = await tokenFor(app, 'director');
    const page1 = await request(app).get('/api/v1/documents?pageSize=3&page=1').set(auth(token));
    expect(page1.body).toMatchObject({ page: 1, pageSize: 3, hasMore: true });
    expect(page1.body.items).toHaveLength(3);
    const last = await request(app).get(`/api/v1/documents?pageSize=3&page=${Math.ceil(page1.body.total / 3)}`).set(auth(token));
    expect(last.body.hasMore).toBe(false);
  });

  it('valida los parámetros de consulta', async () => {
    const res = await request(app).get('/api/v1/documents?dateFrom=ayer').set(auth(await tokenFor(app, 'director')));
    expect(res.status).toBe(400);
  });
});

describe('catálogo y health', () => {
  it('lista los 6 tipos de documento', async () => {
    const res = await request(app).get('/api/v1/document-types').set(auth(await tokenFor(app, 'apoderado')));
    expect(res.body.map((t: { code: string }) => t.code)).toEqual(['MEMO', 'OFICIO', 'CITACION', 'ACUERDO', 'ACTA', 'PERMISO_ADMINISTRATIVO']);
  });

  it('GET /health verifica la base de datos e informa la instancia', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok', instanceId: expect.any(String) });
  });
});
