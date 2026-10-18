import request from 'supertest';
import { getPrisma } from '../src/lib/prisma';
import { SEED_PASSWORD } from '../prisma/seed';
import { auth, buildApp, closeDatabase, emailOf, resetDatabase } from './helpers';

const app = buildApp();

function refreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('gd_refresh='));
  if (!cookie) throw new Error('No se recibió la cookie de refresh');
  return cookie.split(';')[0]!;
}

beforeAll(resetDatabase);
afterAll(closeDatabase);

describe('POST /api/v1/auth/login', () => {
  it('inicia sesión con credenciales correctas y entrega la cookie httpOnly', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('director'), password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: emailOf('director'), role: 'director' });
    expect(res.body.user.passwordHash).toBeUndefined();
    // En web el refresh token no viaja en el cuerpo: solo en la cookie.
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('gd_refresh='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('entrega el refresh token en el cuerpo a la app móvil', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client-Platform', 'native')
      .send({ email: emailOf('apoderado'), password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('docente'), password: 'incorrecta123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Correo o contraseña incorrectos');
  });

  it('rechaza un correo inexistente con el mismo mensaje (sin enumeración)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@rtlco.cl', password: SEED_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Correo o contraseña incorrectos');
  });

  it('valida el formato del cuerpo con 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
  });

  it('rechaza a un usuario desactivado', async () => {
    await getPrisma().user.update({ where: { email: emailOf('docente2') }, data: { isActive: false } });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('docente2'), password: SEED_PASSWORD });
    expect(res.status).toBe(401);
    await getPrisma().user.update({ where: { email: emailOf('docente2') }, data: { isActive: true } });
  });

  it('bloquea tras varios intentos fallidos (rate limit por IP + correo)', async () => {
    const attempt = () =>
      request(app).post('/api/v1/auth/login').send({ email: emailOf('sostenedor'), password: 'malaclave1' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('exige autenticación', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set(auth('token-falso'))).status).toBe(401);
  });

  it('devuelve el perfil y los estudiantes del apoderado', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('apoderado'), password: SEED_PASSWORD });
    const res = await request(app).get('/api/v1/auth/me').set(auth(login.body.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('apoderado');
    expect(res.body.students).toEqual([expect.objectContaining({ course: '5° Básico A' })]);
  });
});

describe('refresh y logout', () => {
  it('rota el refresh token y detecta la reutilización de uno ya usado', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('equipo'), password: SEED_PASSWORD });
    const first = refreshCookie(login);

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);

    // Reutilizar el token anterior revoca todas las sesiones (posible robo).
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', first)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('acepta el refresh token en el cuerpo (app móvil)', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client-Platform', 'native')
      .send({ email: emailOf('docente'), password: SEED_PASSWORD });
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client-Platform', 'native')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('logout revoca el refresh token y limpia la cookie', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailOf('director'), password: SEED_PASSWORD });
    const cookie = refreshCookie(login);
    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('sin refresh token responde 401', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
  });
});
