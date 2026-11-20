import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { seed } from '../dist/db.js';

const secret = 'secreto-exclusivo-auth-supertest-de-32-bytes';
async function fixture(t) {
  const datos = new Datos();
  await seed(datos.db);
  const hash = datos.usuarioPorRut('11111111-1').passwordHash;
  assert.equal(await seed(datos.db), false);
  assert.equal(datos.usuarioPorRut('11111111-1').passwordHash, hash);
  const backend = await crearAplicacion({ datos, secret });
  t.after(() => backend.close());
  const api = request(backend.app);
  async function login() {
    return api.post('/auth/login').send({ rut: '11111111-1', password: 'admin123' }).expect(200);
  }
  return { api, login };
}

test('HU01 Supertest 1: seed SUPERVISOR inicia sesión y devuelve JWT válido por ocho horas', async t => {
  const f = await fixture(t);
  const response = await f.login();
  const claims = jwt.verify(response.body.token, secret, { algorithms: ['HS256'], issuer: 'andina', audience: 'andina-api' });
  assert.equal(claims.sub, String(response.body.usuario.id));
  assert.equal(claims.exp - claims.iat, 28800);
  assert.equal(response.body.expiraEn, 28800);
  assert.equal(response.body.usuario.rol, 'SUPERVISOR');
});

test('HU01 Supertest 2: contraseña incorrecta devuelve 401 CREDENCIALES_INVALIDAS', async t => {
  const f = await fixture(t);
  const response = await f.api.post('/auth/login').send({ rut: '11111111-1', password: 'incorrecta' }).expect(401);
  assert.equal(response.body.codigo, 'CREDENCIALES_INVALIDAS');
});

test('HU01 Supertest 3: /auth/me acepta el token real del login', async t => {
  const f = await fixture(t), login = await f.login();
  const response = await f.api.get('/auth/me').set('Authorization', 'Bearer ' + login.body.token).expect(200);
  assert.deepEqual(response.body, login.body.usuario);
  assert.deepEqual(Object.keys(response.body).sort(), ['activo','id','nombre','plan','rol','rut','tenant_id']);
});

test('HU01 Supertest 4: /auth/me sin token devuelve 401', async t => {
  const f = await fixture(t);
  const response = await f.api.get('/auth/me').expect(401);
  assert.equal(response.body.codigo, 'NO_AUTORIZADO');
  assert.equal(response.headers['www-authenticate'], 'Bearer');
});
