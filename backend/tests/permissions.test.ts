/**
 * Matriz de permisos por rol (la API nunca confía en la interfaz).
 * Documentos del seed y su audiencia:
 *   MEM-2026-014 memo          → rol docente
 *   OF-2026-003  oficio        → solo equipo directivo
 *   CIT-2026-021 citación      → destinatario: apoderado (Paula Díaz)
 *   ACU-2026-002 acuerdo       → roles docente y apoderado
 *   ACT-2026-005 acta          → rol docente
 *   PA-2026-011  permiso adm.  → destinatario: docente (Felipe Soto)
 *   MEM-2025-040 memo ARCHIVADO → roles docente y apoderado (no visible por estar archivado)
 */
import request from 'supertest';
import { getPrisma } from '../src/lib/prisma';
import { auth, buildApp, closeDatabase, documentIdByFolio, resetDatabase, tokenFor, type SeedUserKey } from './helpers';

const app = buildApp();

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function visibleFolios(key: SeedUserKey): Promise<string[]> {
  const res = await request(app).get('/api/v1/documents?pageSize=100').set(auth(await tokenFor(app, key)));
  expect(res.status).toBe(200);
  return (res.body.items as { folioNumber: string }[]).map((d) => d.folioNumber).sort();
}

describe('listado filtrado por rol y visibilidad', () => {
  it.each<SeedUserKey>(['director', 'sostenedor', 'equipo'])('%s ve todos los documentos', async (key) => {
    expect(await visibleFolios(key)).toHaveLength(7);
  });

  it('apoderado ve solo lo visible para su rol y lo dirigido a él', async () => {
    expect(await visibleFolios('apoderado')).toEqual(['ACU-2026-002', 'CIT-2026-021']);
  });

  it('otro apoderado no ve la citación dirigida a un apoderado distinto', async () => {
    expect(await visibleFolios('apoderado2')).toEqual(['ACU-2026-002']);
  });

  it('docente ve lo de su rol y su permiso administrativo', async () => {
    expect(await visibleFolios('docente')).toEqual(['ACT-2026-005', 'ACU-2026-002', 'MEM-2026-014', 'PA-2026-011']);
  });

  it('otro docente no ve el permiso administrativo ajeno', async () => {
    expect(await visibleFolios('docente2')).toEqual(['ACT-2026-005', 'ACU-2026-002', 'MEM-2026-014']);
  });

  it('los roles sin gestión no ven la audiencia de los documentos', async () => {
    const res = await request(app).get('/api/v1/documents').set(auth(await tokenFor(app, 'apoderado')));
    for (const doc of res.body.items) {
      expect(doc.recipients).toBeUndefined();
      expect(doc.visibleRoles).toBeUndefined();
    }
  });
});

describe('detalle y descarga', () => {
  it('apoderado recibe 403 al pedir el detalle de un documento no autorizado', async () => {
    const id = await documentIdByFolio('OF-2026-003');
    const res = await request(app).get(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'apoderado')));
    expect(res.status).toBe(403);
  });

  it('apoderado recibe 403 al pedir la URL de descarga de un documento no autorizado', async () => {
    const id = await documentIdByFolio('CIT-2026-021');
    const res = await request(app)
      .get(`/api/v1/documents/${id}/download-url`)
      .set(auth(await tokenFor(app, 'apoderado2')));
    expect(res.status).toBe(403);
    expect(await getPrisma().downloadLog.count({ where: { documentId: id } })).toBe(0);
  });

  it('apoderado destinatario obtiene una URL firmada de 5 minutos y queda registrada la descarga', async () => {
    const id = await documentIdByFolio('CIT-2026-021');
    const res = await request(app)
      .get(`/api/v1/documents/${id}/download-url`)
      .set(auth(await tokenFor(app, 'apoderado')));
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(300);
    expect(res.body.url).toContain('X-Amz-Expires=300');
    expect(res.body.url).toContain('X-Amz-Signature=');
    expect(await getPrisma().downloadLog.count({ where: { documentId: id } })).toBe(1);
  });

  it('la vista previa (inline) no se registra como descarga', async () => {
    const id = await documentIdByFolio('ACU-2026-002');
    const res = await request(app)
      .get(`/api/v1/documents/${id}/download-url?disposition=inline`)
      .set(auth(await tokenFor(app, 'docente')));
    expect(res.status).toBe(200);
    expect(await getPrisma().downloadLog.count({ where: { documentId: id } })).toBe(0);
  });

  it('un documento archivado deja de ser visible para docentes y apoderados', async () => {
    const id = await documentIdByFolio('MEM-2025-040');
    expect((await request(app).get(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'docente')))).status).toBe(403);
    expect((await request(app).get(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director')))).status).toBe(200);
  });

  it('404 para un documento inexistente', async () => {
    const res = await request(app)
      .get('/api/v1/documents/00000000-0000-4000-8000-000000000000')
      .set(auth(await tokenFor(app, 'director')));
    expect(res.status).toBe(404);
  });

  it('solo el equipo directivo ve el registro de descargas', async () => {
    const id = await documentIdByFolio('CIT-2026-021');
    const ok = await request(app).get(`/api/v1/documents/${id}/downloads`).set(auth(await tokenFor(app, 'equipo')));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual([expect.objectContaining({ user: expect.objectContaining({ role: 'apoderado' }) })]);
    for (const key of ['docente', 'apoderado'] as const) {
      const res = await request(app).get(`/api/v1/documents/${id}/downloads`).set(auth(await tokenFor(app, key)));
      expect(res.status).toBe(403);
    }
  });
});

describe('acciones restringidas por rol', () => {
  it.each<SeedUserKey>(['docente', 'apoderado'])('%s no puede pedir URL de subida', async (key) => {
    const res = await request(app)
      .post('/api/v1/documents/upload-url')
      .set(auth(await tokenFor(app, key)))
      .send({ fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 100 });
    expect(res.status).toBe(403);
  });

  it.each<SeedUserKey>(['docente', 'apoderado'])('%s no puede editar documentos', async (key) => {
    const id = await documentIdByFolio('ACU-2026-002');
    const res = await request(app)
      .patch(`/api/v1/documents/${id}`)
      .set(auth(await tokenFor(app, key)))
      .send({ title: 'Intento de edición' });
    expect(res.status).toBe(403);
  });

  it('equipo directivo edita sus documentos pero no los de otros', async () => {
    const own = await documentIdByFolio('ACT-2026-005');
    const other = await documentIdByFolio('OF-2026-003');
    const token = await tokenFor(app, 'equipo');
    const ok = await request(app).patch(`/api/v1/documents/${own}`).set(auth(token)).send({ status: 'ARCHIVADO' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ARCHIVADO');
    const denied = await request(app).patch(`/api/v1/documents/${other}`).set(auth(token)).send({ title: 'Cambio no permitido' });
    expect(denied.status).toBe(403);
  });

  it('director cambia la visibilidad y el apoderado pasa a ver el documento', async () => {
    const id = await documentIdByFolio('OF-2026-003');
    const res = await request(app)
      .patch(`/api/v1/documents/${id}`)
      .set(auth(await tokenFor(app, 'director')))
      .send({ visibleRoles: ['apoderado'] });
    expect(res.status).toBe(200);
    expect(res.body.visibleRoles).toEqual(['apoderado']);
    expect(await visibleFolios('apoderado')).toContain('OF-2026-003');
  });

  it('equipo directivo no puede eliminar; director sí (borrado lógico)', async () => {
    const id = await documentIdByFolio('MEM-2026-014');
    expect((await request(app).delete(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'equipo')))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director')))).status).toBe(204);
    const doc = await getPrisma().document.findUniqueOrThrow({ where: { id } });
    expect(doc.isDeleted).toBe(true);
    expect((await request(app).get(`/api/v1/documents/${id}`).set(auth(await tokenFor(app, 'director')))).status).toBe(404);
  });

  it('los contadores por tipo son solo para directivos', async () => {
    expect((await request(app).get('/api/v1/documents/stats').set(auth(await tokenFor(app, 'apoderado')))).status).toBe(403);
    const res = await request(app).get('/api/v1/documents/stats').set(auth(await tokenFor(app, 'sostenedor')));
    expect(res.status).toBe(200);
    expect(res.body.byType).toHaveLength(6);
  });
});
