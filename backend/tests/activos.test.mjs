import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';

const password = 'SoloPruebas-Activos-2026';
const hash = hashPassword(password);
const activo = { codigo: 'EQ-0201', nombre: 'Prensa hidráulica', marca: 'Andina', modelo: 'PH-10', ubicacion: 'Planta A', criticidad: 'ALTA' };
async function fixture(t) {
  const datos = new Datos();
  for (const [rol, rut] of [['SUPERVISOR', '12345678-5'], ['TECNICO', '11111111-1']]) {
    datos.crearUsuario({ rut, nombre: rol, rol, activo: true, passwordHash: await hash });
  }
  const backend = await crearAplicacion({ datos, secret: 'secreto-exclusivo-supertest-32-bytes-pruebas' });
  t.after(() => backend.close());
  const api = request(backend.app);
  async function auth(rol = 'SUPERVISOR') {
    const rut = rol === 'SUPERVISOR' ? '12345678-5' : '11111111-1';
    const response = await api.post('/auth/login').send({ rut, password }).expect(200);
    return 'Bearer ' + response.body.token;
  }
  return { api, datos, auth };
}

test('HU02 Supertest 1: SUPERVISOR crea activo válido con valores iniciales', async t => {
  const f = await fixture(t), auth = await f.auth();
  const response = await f.api.post('/activos').set('Authorization', auth).send(activo).expect(201);
  assert.equal(response.body.codigo, activo.codigo);
  assert.equal(response.body.marca, 'Andina');
  assert.equal(response.body.modelo, 'PH-10');
  assert.equal(response.body.estado, 'OPERATIVO');
  assert.equal(response.body.uso_acumulado_horas, 0);
  assert.equal(response.body.deleted_at, null);
  assert(Number.isFinite(Date.parse(response.body.fecha_alta)));
});

test('HU02 Supertest 2: código duplicado devuelve 409 CODIGO_DUPLICADO', async t => {
  const f = await fixture(t), auth = await f.auth();
  await f.api.post('/activos').set('Authorization', auth).send(activo).expect(201);
  const response = await f.api.post('/activos').set('Authorization', auth).send(activo).expect(409);
  assert.equal(response.body.codigo, 'CODIGO_DUPLICADO');
});

test('HU02 Supertest 3: TECNICO no puede crear activos', async t => {
  const f = await fixture(t), auth = await f.auth('TECNICO');
  const response = await f.api.post('/activos').set('Authorization', auth).send(activo).expect(403);
  assert.equal(response.body.codigo, 'SIN_PERMISO');
  assert.equal(f.datos.listar({ page: 1, size: 20 }).total, 0);
});

test('HU02 Supertest 4: q busca en nombre/código y comparte filtros con el total', async t => {
  const f = await fixture(t), auth = await f.auth();
  await f.api.post('/activos').set('Authorization', auth).send(activo).expect(201);
  await f.api.post('/activos').set('Authorization', auth).send({ ...activo, codigo: 'EQ-0202', nombre: 'Motor', criticidad: 'BAJA' }).expect(201);
  const response = await f.api.get('/activos').set('Authorization', auth).query({ q: 'PRENSA', criticidad: 'ALTA', estado: 'OPERATIVO' }).expect(200);
  assert.deepEqual(response.body.items.map(item => item.codigo), ['EQ-0201']);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.page, 1);
  assert.equal(response.body.size, 20);
  const byCode = await f.api.get('/activos').set('Authorization', auth).query({ q: 'EQ-0202' }).expect(200);
  assert.deepEqual(byCode.body.items.map(item => item.nombre), ['Motor']);
});

test('HU02 Supertest 5: DELETE conserva fila, cambia estado y oculta el activo', async t => {
  const f = await fixture(t), auth = await f.auth();
  const created = await f.api.post('/activos').set('Authorization', auth).send(activo).expect(201);
  const path = '/activos/' + created.body.id;
  await f.api.delete(path).set('Authorization', auth).expect(204);
  const row = f.datos.db.prepare('SELECT * FROM activos WHERE id=?').get(created.body.id);
  assert(row);
  assert.equal(row.estado, 'FUERA_DE_SERVICIO');
  assert(Number.isFinite(Date.parse(row.deleted_at)));
  const list = await f.api.get('/activos').set('Authorization', auth).expect(200);
  assert.equal(list.body.total, 0);
  const missing = await f.api.get(path).set('Authorization', auth).expect(404);
  assert.equal(missing.body.codigo, 'ACTIVO_NO_ENCONTRADO');
  const duplicate = await f.api.post('/activos').set('Authorization', auth).send(activo).expect(409);
  assert.equal(duplicate.body.codigo, 'CODIGO_DUPLICADO');
});
