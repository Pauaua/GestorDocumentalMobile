import request from 'supertest';
import { SEED_PASSWORD } from '../prisma/seed';
import { auth, buildApp, closeDatabase, resetDatabase, tokenFor, userId, type SeedUserKey } from './helpers';

const app = buildApp();

beforeAll(resetDatabase);
afterAll(closeDatabase);

const newUser = {
  fullName: 'Valentina Reyes Soto',
  rut: '18.765.432-7',
  email: 'VReyes@rtlco.cl',
  password: 'Clave2026',
  role: 'docente',
};

describe('gestión de usuarios', () => {
  it.each<SeedUserKey>(['docente', 'apoderado'])('%s no puede listar usuarios', async (key) => {
    expect((await request(app).get('/api/v1/users').set(auth(await tokenFor(app, key)))).status).toBe(403);
  });

  it('equipo directivo puede listar (para elegir destinatarios) pero no crear', async () => {
    const token = await tokenFor(app, 'equipo');
    const list = await request(app).get('/api/v1/users?role=apoderado').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.items.every((u: { role: string }) => u.role === 'apoderado')).toBe(true);
    expect(list.body.items[0].passwordHash).toBeUndefined();
    expect((await request(app).post('/api/v1/users').set(auth(token)).send(newUser)).status).toBe(403);
  });

  it('busca apoderados por el nombre del estudiante', async () => {
    const res = await request(app).get('/api/v1/users?q=tomás').set(auth(await tokenFor(app, 'director')));
    expect(res.body.items).toEqual([expect.objectContaining({ email: 'apoderado@rtlco.cl' })]);
  });

  it('director crea un usuario con RUT válido y el usuario puede iniciar sesión', async () => {
    const res = await request(app).post('/api/v1/users').set(auth(await tokenFor(app, 'director'))).send(newUser);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ rut: '18765432-7', email: 'vreyes@rtlco.cl', role: 'docente', isActive: true });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'vreyes@rtlco.cl', password: 'Clave2026' });
    expect(login.status).toBe(200);
  });

  it('rechaza RUT inválido y correo duplicado', async () => {
    const token = await tokenFor(app, 'sostenedor');
    const badRut = await request(app).post('/api/v1/users').set(auth(token)).send({ ...newUser, rut: '18765432-1', email: 'otro@x.cl' });
    expect(badRut.status).toBe(400);
    const dup = await request(app).post('/api/v1/users').set(auth(token)).send({ ...newUser, rut: '11111111-1' });
    expect(dup.status).toBe(409);
  });

  it('sostenedor cambia el rol y desactiva a un usuario; el token del desactivado deja de servir', async () => {
    const docenteToken = await tokenFor(app, 'docente2');
    const id = await userId('docente2');
    const token = await tokenFor(app, 'sostenedor');
    const role = await request(app).patch(`/api/v1/users/${id}`).set(auth(token)).send({ role: 'equipo_directivo' });
    expect(role.status).toBe(200);
    expect(role.body.role).toBe('equipo_directivo');
    const off = await request(app).patch(`/api/v1/users/${id}`).set(auth(token)).send({ isActive: false });
    expect(off.body.isActive).toBe(false);
    expect((await request(app).get('/api/v1/auth/me').set(auth(docenteToken))).status).toBe(401);
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const id = await userId('director');
    const res = await request(app).patch(`/api/v1/users/${id}`).set(auth(await tokenFor(app, 'director'))).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('el cambio de contraseña invalida las sesiones anteriores', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'apoderado2@rtlco.cl', password: SEED_PASSWORD });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const id = await userId('apoderado2');
    await request(app).patch(`/api/v1/users/${id}`).set(auth(await tokenFor(app, 'director'))).send({ password: 'NuevaClave99' });
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});
