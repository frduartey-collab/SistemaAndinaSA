import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { rutValido, normalizarRut } from '../dist/rut.js';
import { esquema } from '../dist/validacion.js';

// El día civil es 18/11 en Chile y 19/11 en UTC.
const AHORA = Date.parse('2026-11-19T01:30:00Z');
const clave = 'Andina-Prueba-Ordenes!';
const hash = hashPassword(clave);

async function fixture(t) {
  const datos = new Datos();
  const personas = {};
  for (const [clavePersona, rut, rol, activo] of [
    ['supervisor', '11111111-1', 'SUPERVISOR', true],
    ['tecnico', '22222222-2', 'TECNICO', true],
    ['otro', '33333333-3', 'TECNICO', true],
    ['bodega', '44444444-4', 'BODEGA', true],
    ['jefatura', '55555555-5', 'JEFATURA', true],
    ['trabajador', '66666666-6', 'TRABAJADOR', true],
    ['inactivo', '77777777-7', 'TECNICO', false],
  ]) {
    personas[clavePersona] = datos.crearUsuario({ rut, nombre: clavePersona, rol, activo, passwordHash: await hash });
  }
  const equipo = datos.crear({
    codigo: 'EQ-0140', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA',
  }, personas.supervisor.id, AHORA);
  const backend = await crearAplicacion({
    secret: 'secreto-de-pruebas-local-HU04-sintetico', datos, now: () => AHORA,
  });
  t.after(() => backend.close());
  const api = request(backend.app);

  async function sesion(persona) {
    const { body } = await api.post('/auth/login').send({ rut: personas[persona].rut, password: clave }).expect(200);
    return 'Bearer ' + body.token;
  }

  async function falla(token) {
    const { body } = await api.post('/fallas').set('Authorization', token)
      .send({ equipo_id: equipo.id, descripcion: 'La prensa se detuvo.' }).expect(201);
    return body;
  }

  return { api, datos, personas, equipo, sesion, falla };
}

test('Módulo 11 compartido valida DV numérico, cero y K', () => {
  for (const rut of ['12345678-5', '10.000.004-0', '10.000.013-k']) {
    assert(rutValido(normalizarRut(rut)), rut);
  }
  for (const rut of ['12.345.678-9', '10.000.013-0', '00000000-0', 'abc']) {
    assert(!rutValido(normalizarRut(rut)), rut);
  }
});

test('Crear orden exige administrador, técnico activo y fecha civil válida. La falla admite una orden', async (t) => {
  const f = await fixture(t);
  const admin = await f.sesion('supervisor');
  const tecnico = await f.sesion('tecnico');
  const falla = await f.falla(tecnico);
  const datos = { falla_id: falla.id, tecnico_id: f.personas.tecnico.id, fecha_limite: '2026-11-18' };
  await f.api.post('/ordenes').send(datos).expect(401);
  await f.api.post('/ordenes').set('Authorization', tecnico).send(datos).expect(403);
  await f.api.post('/ordenes').set('Authorization', admin).send({ ...datos, fecha_limite: '2026-11-17' }).expect(400);
  await f.api.post('/ordenes').set('Authorization', admin).send({ ...datos, fecha_limite: '2027-02-30' }).expect(400);
  await f.api.post('/ordenes').set('Authorization', admin).send({ ...datos, falla_id: 900 }).expect(404);

  for (const tecnicoId of [f.personas.bodega.id, f.personas.inactivo.id, 900]) {
    const { body } = await f.api.post('/ordenes').set('Authorization', admin)
      .send({ ...datos, tecnico_id: tecnicoId }).expect(409);
    assert.equal(body.codigo, 'TECNICO_NO_DISPONIBLE');
  }

  const pendientes = await f.api.get('/fallas?sin_orden=true').set('Authorization', admin).expect(200);
  assert.deepEqual(pendientes.body.items.map(({ id }) => id), [falla.id]);
  await f.api.get('/fallas?sin_orden=true').set('Authorization', tecnico).expect(403);
  const respuestas = await Promise.all([0, 1].map(() =>
    f.api.post('/ordenes').set('Authorization', admin).send(datos)));
  assert.deepEqual(respuestas.map((res) => res.status).sort(), [201, 409]);
  const creada = respuestas.find((res) => res.status === 201).body;
  assert(esquema('ordenes', 'OrdenRespuesta')(creada));
  assert.equal(creada.estado, 'PENDIENTE');
  assert.equal(creada.tecnico_id, f.personas.tecnico.id);
  assert.equal(respuestas.find((res) => res.status === 409).body.codigo, 'ORDEN_DUPLICADA');
  assert.equal((await f.api.get('/fallas?sin_orden=true').set('Authorization', admin).expect(200)).body.total, 0);
  assert.equal((await f.api.get('/fallas').set('Authorization', tecnico).expect(200)).body.total, 1);
});

test('Listado y cambios de estado se limitan al técnico asignado o un administrador', async (t) => {
  const f = await fixture(t);
  const admin = await f.sesion('jefatura');
  const tecnico = await f.sesion('tecnico');
  const otro = await f.sesion('otro');
  const falla = await f.falla(tecnico);
  const orden = await f.api.post('/ordenes').set('Authorization', admin)
    .send({ falla_id: falla.id, tecnico_id: f.personas.tecnico.id, fecha_limite: '2026-11-20' }).expect(201);
  const url = '/ordenes/' + orden.body.id + '/estado';

  const acceso = await f.api.get('/ordenes?size=1').set('Authorization', tecnico).expect(200);
  assert(esquema('ordenes', 'PaginaOrdenes')(acceso.body));
  assert.equal(acceso.body.total, 1);
  assert.equal((await f.api.get('/ordenes').set('Authorization', otro).expect(200)).body.total, 0);
  assert.equal((await f.api.get('/ordenes').set('Authorization', admin).expect(200)).body.total, 1);
  for (const rol of ['bodega', 'trabajador']) {
    const token = await f.sesion(rol);
    await f.api.get('/ordenes').set('Authorization', token).expect(403);
    await f.api.patch(url).set('Authorization', token).send({ estado: 'EN_PROGRESO' }).expect(403);
  }
  const oculto = await f.api.patch(url).set('Authorization', otro).send({ estado: 'EN_PROGRESO' }).expect(404);
  assert.equal(oculto.body.codigo, 'ORDEN_NO_ENCONTRADA');
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'CERRADA' }).expect(409);
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  const cerrada = await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'CERRADA' }).expect(200);
  assert.equal(cerrada.body.estado, 'CERRADA');
  await f.api.patch(url).set('Authorization', admin).send({ estado: 'PENDIENTE' }).expect(409);
  assert.equal(f.datos.db.prepare("SELECT count(*) AS n FROM auditoria WHERE accion = 'ORDEN_ESTADO_EN_PROGRESO'").get().n, 1);
});

test('Selector expone solo técnicos activos y excluye fallas de equipos dados de baja', async (t) => {
  const f = await fixture(t);
  const admin = await f.sesion('supervisor');
  const tecnico = await f.sesion('tecnico');
  const falla = await f.falla(tecnico);
  await f.api.get('/ordenes/tecnicos').set('Authorization', tecnico).expect(403);
  const opciones = await f.api.get('/ordenes/tecnicos?size=1&page=2').set('Authorization', admin).expect(200);
  assert(esquema('ordenes', 'PaginaTecnicos')(opciones.body));
  assert.equal(opciones.body.total, 2);
  assert.deepEqual(opciones.body.items, [{ id: f.personas.tecnico.id, nombre: 'tecnico' }]);
  const busqueda = await f.api.get('/ordenes/tecnicos?q=otro').set('Authorization', admin).expect(200);
  assert.deepEqual(busqueda.body.items, [{ id: f.personas.otro.id, nombre: 'otro' }]);

  await f.api.delete('/activos/' + f.equipo.id).set('Authorization', admin).expect(204);
  assert.equal((await f.api.get('/fallas?sin_orden=true').set('Authorization', admin).expect(200)).body.total, 0);
  assert.equal((await f.api.get('/fallas').set('Authorization', admin).expect(200)).body.total, 1);
  await f.api.post('/ordenes').set('Authorization', admin)
    .send({ falla_id: falla.id, tecnico_id: f.personas.tecnico.id, fecha_limite: '2026-11-20' }).expect(404);
});
