/**
 * Multi-tenant: aislamiento entre colegios, membresías múltiples, sostenedor de red y consola de plataforma.
 * Seed: red "Red Educacional Demo" con los colegios demo y demo-norte.
 *   - docente (Felipe Soto) es docente en ambos colegios
 *   - sostenedor administra la red (sin membresía directa)
 *   - directorNorte solo pertenece a demo-norte; admin@rtlco.cl es superadmin
 */
import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed';
import { computeRutDv } from '../src/lib/rut';
import { auth, buildApp, closeDatabase, documentIdByFolio, emailOf, resetDatabase, userId, type SeedUserKey } from './helpers';

const app = buildApp();
const NORTE = { 'X-School': 'demo-norte' };
const rut = (body: string) => `${body}-${computeRutDv(body)}`;

beforeAll(resetDatabase);
afterAll(closeDatabase);

async function loginAt(key: SeedUserKey, school: string, password = SEED_PASSWORD) {
  return request(app).post('/api/v1/auth/login').set('X-School', school).send({ email: emailOf(key), password });
}

async function tokenAt(key: SeedUserKey, school: string): Promise<string> {
  const res = await loginAt(key, school);
  if (res.status !== 200) throw new Error(`Login de ${key} en ${school} falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

async function folios(token: string, school: string): Promise<string[]> {
  const res = await request(app).get('/api/v1/documents?pageSize=100').set('X-School', school).set(auth(token));
  expect(res.status).toBe(200);
  return (res.body.items as { folioNumber: string }[]).map((d) => d.folioNumber).sort();
}

async function platformToken(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/platform/login')
    .send({ email: emailOf('plataforma'), password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('resolución del colegio', () => {
  it('entrega los datos públicos del colegio por header o por subdominio', async () => {
    const byHeader = await request(app).get('/api/v1/school').set(NORTE);
    expect(byHeader.status).toBe(200);
    expect(byHeader.body).toEqual({ slug: 'demo-norte', name: 'Colegio Demo Norte', primaryColor: '#9FD3C7' });
    const byHost = await request(app).get('/api/v1/school').set('Host', 'demo-norte.rtlco.cl');
    expect(byHost.body.slug).toBe('demo-norte');
    // El subdominio tiene prioridad sobre el header.
    const both = await request(app).get('/api/v1/school').set('Host', 'demo-norte.rtlco.cl').set('X-School', 'demo');
    expect(both.body.slug).toBe('demo-norte');
  });

  it('responde 404 para un colegio inexistente o un slug inválido', async () => {
    expect((await request(app).get('/api/v1/school').set('X-School', 'no-existe')).status).toBe(404);
    expect((await request(app).get('/api/v1/school').set('X-School', '../etc')).status).toBe(404);
  });
});

describe('aislamiento entre colegios', () => {
  it('el docente con dos membresías ve solo los documentos del colegio en que inició sesión', async () => {
    expect(await folios(await tokenAt('docente', 'demo-norte'), 'demo-norte')).toEqual(['MEM-N-2026-001']);
    const demo = await folios(await tokenAt('docente', 'demo'), 'demo');
    expect(demo).not.toContain('MEM-N-2026-001');
    expect(demo).toContain('MEM-2026-014');
  });

  it('un token de un colegio no sirve en otro', async () => {
    const demoToken = await tokenAt('docente', 'demo');
    const res = await request(app).get('/api/v1/documents').set(NORTE).set(auth(demoToken));
    expect(res.status).toBe(401);
  });

  it('el refresh token de un colegio no se puede usar desde otro', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-School', 'demo')
      .set('X-Client-Platform', 'native')
      .send({ email: emailOf('docente'), password: SEED_PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set(NORTE)
      .set('X-Client-Platform', 'native')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(401);
  });

  it('no se puede iniciar sesión en un colegio sin membresía', async () => {
    const res = await loginAt('apoderado', 'demo-norte');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Tu cuenta no tiene acceso a este colegio');
  });

  it('un documento de otro colegio responde 404 (no revela que existe)', async () => {
    const norteDoc = await documentIdByFolio('MEM-N-2026-001');
    const token = await tokenAt('director', 'demo');
    expect((await request(app).get(`/api/v1/documents/${norteDoc}`).set(auth(token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/documents/${norteDoc}/download-url`).set(auth(token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/documents/${norteDoc}`).set(auth(token)).send({ title: 'Intrusión' })).status).toBe(404);
  });

  it('no se puede asignar como destinatario a una persona de otro colegio', async () => {
    const token = await tokenAt('director', 'demo');
    const res = await request(app)
      .patch(`/api/v1/documents/${await documentIdByFolio('OF-2026-003')}`)
      .set(auth(token))
      .send({ recipientIds: [await userId('directorNorte')] });
    expect(res.status).toBe(400);
  });

  it('el listado de usuarios solo incluye miembros del colegio', async () => {
    const res = await request(app).get('/api/v1/users?pageSize=200').set(auth(await tokenAt('director', 'demo')));
    const emails = (res.body.items as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(emailOf('docente'));
    expect(emails).not.toContain(emailOf('directorNorte'));
    const patch = await request(app)
      .patch(`/api/v1/users/${await userId('directorNorte')}`)
      .set(auth(await tokenAt('director', 'demo')))
      .send({ role: 'docente' });
    expect(patch.status).toBe(404);
  });

  it('las estadísticas cuentan solo los documentos del colegio', async () => {
    const res = await request(app).get('/api/v1/documents/stats').set(NORTE).set(auth(await tokenAt('directorNorte', 'demo-norte')));
    expect(res.body.total).toBe(1);
  });
});

describe('membresías y cuentas compartidas', () => {
  it('perfil: rol del colegio actual y lista de colegios disponibles', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(NORTE).set(auth(await tokenAt('docente', 'demo-norte')));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'docente', school: { slug: 'demo-norte' } });
    expect((res.body.schools as { slug: string }[]).map((s) => s.slug).sort()).toEqual(['demo', 'demo-norte']);
  });

  it('agregar a una persona que ya tiene cuenta crea solo la membresía y no cambia su contraseña', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(await tokenAt('director', 'demo')))
      .send({
        fullName: 'Nombre distinto',
        rut: rut('11223344'),
        email: emailOf('directorNorte'),
        password: 'OtraClave123',
        role: 'equipo_directivo',
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ existingAccount: true, role: 'equipo_directivo', fullName: 'Ignacio Fuentes Lagos' });
    expect((await loginAt('directorNorte', 'demo')).status).toBe(200);
    expect((await loginAt('directorNorte', 'demo', 'OtraClave123')).status).toBe(401);
  });

  it('rechaza un correo existente con un RUT distinto', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(await tokenAt('director', 'demo')))
      .send({ fullName: 'Suplantación', rut: '18.765.432-7', email: emailOf('docente'), password: 'Clave2026', role: 'docente' });
    expect(res.status).toBe(409);
  });

  it('un colegio no puede cambiar la contraseña de una cuenta que también es de otro colegio', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${await userId('docente')}`)
      .set(auth(await tokenAt('director', 'demo')))
      .send({ password: 'Secuestro123' });
    expect(res.status).toBe(409);
    // El rol y el estado en el colegio sí se pueden cambiar.
    const role = await request(app)
      .patch(`/api/v1/users/${await userId('docente')}`)
      .set(auth(await tokenAt('director', 'demo')))
      .send({ isActive: false });
    expect(role.status).toBe(200);
    expect((await loginAt('docente', 'demo')).status).toBe(401);
    expect((await loginAt('docente', 'demo-norte')).status).toBe(200);
    await request(app)
      .patch(`/api/v1/users/${await userId('docente')}`)
      .set(auth(await tokenAt('director', 'demo')))
      .send({ isActive: true });
  });
});

describe('sostenedor de red', () => {
  it('entra como sostenedor a cualquier colegio de su red y ve sus documentos', async () => {
    const login = await loginAt('sostenedor', 'demo-norte');
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ role: 'sostenedor', school: { slug: 'demo-norte' } });
    expect(await folios(login.body.accessToken, 'demo-norte')).toEqual(['MEM-N-2026-001']);
    const me = await request(app).get('/api/v1/auth/me').set(NORTE).set(auth(login.body.accessToken));
    expect((me.body.schools as { slug: string; role: string }[]).every((s) => s.role === 'sostenedor')).toBe(true);
  });
});

describe('consola de la plataforma', () => {
  it('solo el superadmin inicia sesión en la plataforma', async () => {
    const res = await request(app)
      .post('/api/v1/auth/platform/login')
      .send({ email: emailOf('director'), password: SEED_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('el superadmin no tiene acceso a los documentos de los colegios', async () => {
    const token = await platformToken();
    expect((await request(app).get('/api/v1/documents').set(auth(token))).status).toBe(401);
    expect((await loginAt('plataforma', 'demo')).status).toBe(401);
  });

  it('un token de colegio no sirve en la plataforma', async () => {
    const res = await request(app).get('/api/v1/platform/schools').set(auth(await tokenAt('director', 'demo')));
    expect(res.status).toBe(403);
  });

  it('lista colegios con sus conteos', async () => {
    const res = await request(app).get('/api/v1/platform/schools').set(auth(await platformToken()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'demo-norte', _count: { memberships: 2, documents: 1 } })]),
    );
  });

  it('crea un colegio con su director, que puede entrar; al suspenderlo se cierra el acceso', async () => {
    const token = await platformToken();
    const created = await request(app)
      .post('/api/v1/platform/schools')
      .set(auth(token))
      .send({
        slug: 'San-Andres',
        name: 'Colegio San Andrés',
        rbd: '12345-6',
        plan: 'estandar',
        director: { fullName: 'Lucía Bravo Torres', rut: rut('19876543'), email: 'lbravo@sanandres.cl', password: 'Directora2026' },
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: 'san-andres', plan: 'estandar', director: { existingAccount: false } });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-School', 'san-andres')
      .send({ email: 'lbravo@sanandres.cl', password: 'Directora2026' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('director');
    expect(await folios(login.body.accessToken, 'san-andres')).toEqual([]);

    const suspend = await request(app).patch(`/api/v1/platform/schools/${created.body.id}`).set(auth(token)).send({ isActive: false });
    expect(suspend.status).toBe(200);
    const denied = await request(app).get('/api/v1/documents').set('X-School', 'san-andres').set(auth(login.body.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SCHOOL_SUSPENDED');
  });

  it('rechaza subdominios reservados o repetidos', async () => {
    const token = await platformToken();
    const director = { fullName: 'Otra Persona', rut: rut('20111222'), email: 'otra@x.cl', password: 'Clave2026x' };
    expect((await request(app).post('/api/v1/platform/schools').set(auth(token)).send({ slug: 'app', name: 'Reservado', director })).status).toBe(400);
    expect((await request(app).post('/api/v1/platform/schools').set(auth(token)).send({ slug: 'demo', name: 'Repetido', director })).status).toBe(409);
  });

  it('crea una red y asigna a su sostenedor', async () => {
    const token = await platformToken();
    const org = await request(app).post('/api/v1/platform/organizations').set(auth(token)).send({ name: 'Fundación Educacional Sur' });
    expect(org.status).toBe(201);
    const admin = await request(app)
      .post(`/api/v1/platform/organizations/${org.body.id}/admins`)
      .set(auth(token))
      .send({ fullName: 'Pedro Lagos Mena', rut: rut('15678901'), email: 'plagos@fundsur.cl', password: 'Sostenedor26' });
    expect(admin.status).toBe(201);
    expect(admin.body.existingAccount).toBe(false);
  });
});
