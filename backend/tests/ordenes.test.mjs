import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { hashPassword } from '../dist/seguridad.js';
import { rutValido, normalizarRut } from '../dist/rut.js';
import { esquema } from '../dist/validacion.js';

// El día civil es 18/11 en Chile y 19/11 en UTC.
const AHORA = Date.parse('2026-11-19T01:30:00Z');
const clave = 'Andina-Prueba-Ordenes!';
const hash = hashPassword(clave);
const cierre = { diagnostico: 'Rodamiento desgastado', solucion: 'Se reemplazó el rodamiento', duracion_minutos: 25 };

async function fixture(t, preparar) {
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
  preparar?.(datos, personas, equipo);
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

  for (const tecnicoId of [f.personas.bodega.id, f.personas.trabajador.id, f.personas.inactivo.id, 900]) {
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
    for (const respuesta of [
      await f.api.get('/ordenes?solo_abiertas=true').set('Authorization', token).expect(403),
      await f.api.get('/ordenes/tecnicos').set('Authorization', token).expect(403),
      await f.api.post('/ordenes').set('Authorization', token)
        .send({ falla_id: falla.id, tecnico_id: f.personas.tecnico.id, fecha_limite: '2026-11-20' }).expect(403),
      await f.api.patch(url).set('Authorization', token).send({ estado: 'EN_PROGRESO' }).expect(403),
    ]) assert.equal(respuesta.body.codigo, 'SIN_PERMISO');
  }
  const oculto = await f.api.patch(url).set('Authorization', otro).send({ estado: 'EN_PROGRESO' }).expect(404);
  assert.equal(oculto.body.codigo, 'ORDEN_NO_ENCONTRADA');
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'CERRADA' }).expect(400);
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  const cerrada = await f.api.put('/ordenes/' + orden.body.id + '/cierre').set('Authorization', tecnico).send(cierre).expect(200);
  assert.equal(cerrada.body.estado, 'CERRADA');
  await f.api.patch(url).set('Authorization', admin).send({ estado: 'EN_PROGRESO' }).expect(409);
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

test('Las órdenes abiertas se filtran antes de paginar y respetan al técnico asignado', async (t) => {
  const f = await fixture(t);
  const admin = await f.sesion('supervisor');
  const tecnico = await f.sesion('tecnico');
  const otro = await f.sesion('otro');

  async function crear(tecnicoId) {
    const falla = await f.falla(tecnico);
    const { body } = await f.api.post('/ordenes').set('Authorization', admin)
      .send({ falla_id: falla.id, tecnico_id: tecnicoId, fecha_limite: '2026-11-20' }).expect(201);
    return body.id;
  }

  const pendiente = await crear(f.personas.tecnico.id);
  const ultima = await crear(f.personas.tecnico.id);
  const ajena = await crear(f.personas.otro.id);
  const url = '/ordenes/' + ultima + '/estado';
  const abiertas = '/ordenes?solo_abiertas=true&size=1';

  await f.api.patch(url).set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  const enProgreso = await f.api.get(abiertas).set('Authorization', tecnico).expect(200);
  assert.equal(enProgreso.body.items[0].id, ultima);
  assert.equal(enProgreso.body.items[0].estado, 'EN_PROGRESO');
  assert.equal(enProgreso.body.total, 2);

  await f.api.put('/ordenes/' + ultima + '/cierre').set('Authorization', tecnico).send(cierre).expect(200);
  const primera = await f.api.get(abiertas).set('Authorization', tecnico).expect(200);
  assert.deepEqual(primera.body.items.map(({ id }) => id), [pendiente]);
  assert.equal(primera.body.total, 1);
  assert.deepEqual((await f.api.get(abiertas).set('Authorization', otro).expect(200)).body.items.map(({ id }) => id), [ajena]);
  assert.equal((await f.api.get('/ordenes?solo_abiertas=false').set('Authorization', tecnico).expect(200)).body.total, 2);
  await f.api.get('/ordenes?solo_abiertas=1').set('Authorization', tecnico).expect(400);
});


async function crearOrden(f) {
  const admin = await f.sesion('supervisor');
  const tecnico = await f.sesion('tecnico');
  const falla = await f.falla(tecnico);
  const { body } = await f.api.post('/ordenes').set('Authorization', admin)
    .send({ falla_id: falla.id, tecnico_id: f.personas.tecnico.id, fecha_limite: '2026-11-20' }).expect(201);
  return { id: body.id, ruta: '/ordenes/' + body.id, admin, tecnico };
}

test('El detalle respeta permisos y solo el técnico asignado puede cerrar una orden en progreso', async (t) => {
  const f = await fixture(t);
  const { id, ruta, admin, tecnico } = await crearOrden(f);
  const otro = await f.sesion('otro');
  const trabajador = await f.sesion('trabajador');
  const put = (token, body = cierre) => f.api.put(ruta + '/cierre').set('Authorization', token).send(body);

  await f.api.get(ruta).expect(401);
  await f.api.put(ruta + '/cierre').send(cierre).expect(401);
  await f.api.get(ruta).set('Authorization', trabajador).expect(403);
  await f.api.get(ruta).set('Authorization', otro).expect(404);
  await put(trabajador).expect(403);
  await put(admin).expect(403);
  await put(otro).expect(404);
  const detalle = await f.api.get(ruta).set('Authorization', tecnico).expect(200);
  assert(esquema('ordenes', 'OrdenDetalleRespuesta')(detalle.body));
  assert.equal(detalle.body.intervencion, null);
  assert.equal((await put(tecnico).expect(409)).body.codigo, 'TRANSICION_ORDEN_INVALIDA');
  await f.api.patch(ruta + '/estado').set('Authorization', admin).send({ estado: 'EN_PROGRESO' }).expect(200);
  assert.throws(
    () => f.datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'CERRADA' WHERE id = ?").run(id),
    /requiere una intervención/,
  );
  for (const invalido of [
    { diagnostico: '   ' }, { solucion: '' }, { duracion_minutos: 0 }, { duracion_minutos: 1.5 },
    { duracion_minutos: Number.MAX_SAFE_INTEGER + 1 }, { repuestos_usados: null },
    { repuestos_usados: 'x'.repeat(2001) }, { diagnostico: 'Mal\u0000texto' }, { cantidad: 1 },
  ]) {
    await put(tecnico, { ...cierre, ...invalido }).expect(400);
  }

  const { body } = await put(tecnico, { ...cierre, repuestos_usados: '  Un rodamiento  ' }).expect(200);
  assert(esquema('ordenes', 'OrdenDetalleRespuesta')(body));
  assert.equal(body.estado, 'CERRADA');
  assert.deepEqual(body.intervencion, {
    orden_id: id, autor_id: f.personas.tecnico.id, ...cierre,
    repuestos_usados: 'Un rodamiento', registrada_en: new Date(AHORA).toISOString(),
  });
  assert.deepEqual((await f.api.get(ruta).set('Authorization', admin).expect(200)).body, body);
});

test('Cierre concurrente e idempotente guarda una intervención y un único evento de auditoría', async (t) => {
  const f = await fixture(t);
  const { id, ruta, tecnico } = await crearOrden(f);
  const put = (body) => f.api.put(ruta + '/cierre').set('Authorization', tecnico).send(body);
  await f.api.patch(ruta + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  const [primera, segunda] = await Promise.all([
    put(cierre).expect(200),
    put({ ...cierre, diagnostico: ' ' + cierre.diagnostico, repuestos_usados: '   ' }).expect(200),
  ]);
  assert.deepEqual(segunda.body, primera.body);
  assert.equal(segunda.body.intervencion.repuestos_usados, null);
  const conflicto = await put({ ...cierre, duracion_minutos: 26 }).expect(409);
  assert.equal(conflicto.body.codigo, 'ORDEN_YA_CERRADA');
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM intervenciones WHERE orden_id = ?').get(id).n, 1);
  assert.equal(f.datos.db.prepare("SELECT count(*) AS n FROM auditoria WHERE accion = 'ORDEN_CERRADA_CON_INTERVENCION'").get().n, 1);
  assert.throws(() => f.datos.db.prepare('UPDATE intervenciones SET duracion_minutos = 26 WHERE orden_id = ?').run(id), /inmutable/);
  assert.throws(() => f.datos.db.prepare('DELETE FROM intervenciones WHERE orden_id = ?').run(id), /inmutable/);
});

test('Un error antes de confirmar el cierre revierte la intervención y permite reintentar', async (t) => {
  const f = await fixture(t);
  const { id, ruta, tecnico } = await crearOrden(f);
  await f.api.patch(ruta + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  f.datos.db.exec(`
    CREATE TRIGGER bloquear_auditoria_cierre BEFORE INSERT ON auditoria
    WHEN NEW.accion = 'ORDEN_CERRADA_CON_INTERVENCION'
    BEGIN SELECT RAISE(ABORT, 'Fallo de auditoría simulado'); END;
  `);
  await f.api.put(ruta + '/cierre').set('Authorization', tecnico).send(cierre).expect(500);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM intervenciones WHERE orden_id = ?').get(id).n, 0);
  const { body } = await f.api.get(ruta).set('Authorization', tecnico).expect(200);
  assert.equal(body.estado, 'EN_PROGRESO');
  assert.equal(body.intervencion, null);

  f.datos.db.exec('DROP TRIGGER bloquear_auditoria_cierre');
  await f.api.put(ruta + '/cierre').set('Authorization', tecnico).send(cierre).expect(200);
});

test('Una orden histórica cerrada conserva su estado sin inventar una intervención', async (t) => {
  let id;
  const f = await fixture(t, (datos, personas, equipo) => {
    const fallas = new Fallas(datos);
    const falla = fallas.crear({ equipo_id: equipo.id, descripcion: 'Falla histórica.' }, personas.tecnico.id, AHORA);
    datos.db.exec(`
      CREATE TABLE ordenes_trabajo (
        id INTEGER PRIMARY KEY,
        falla_id INTEGER NOT NULL UNIQUE REFERENCES fallas(id),
        tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
        fecha_limite TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'CERRADA'))
      );
    `);
    const insercion = datos.db.prepare(`
      INSERT INTO ordenes_trabajo (falla_id, tecnico_id, fecha_limite, estado)
      VALUES (?, ?, '2026-11-20', 'CERRADA')
    `).run(falla.id, personas.tecnico.id);
    id = Number(insercion.lastInsertRowid);
  });
  const admin = await f.sesion('supervisor');
  const tecnico = await f.sesion('tecnico');
  const ruta = '/ordenes/' + id;

  const { body } = await f.api.get(ruta).set('Authorization', admin).expect(200);
  assert(esquema('ordenes', 'OrdenDetalleRespuesta')(body));
  assert.equal(body.estado, 'CERRADA');
  assert.equal(body.intervencion, null);
  const conflicto = await f.api.put(ruta + '/cierre').set('Authorization', tecnico).send(cierre).expect(409);
  assert.equal(conflicto.body.codigo, 'ORDEN_YA_CERRADA');
  await f.api.patch(ruta + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(409);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM intervenciones WHERE orden_id = ?').get(id).n, 0);
  assert.throws(() => f.datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'PENDIENTE' WHERE id = ?").run(id), /inmutable/);
  assert.throws(() => f.datos.db.prepare('DELETE FROM ordenes_trabajo WHERE id = ?').run(id), /inmutable/);
});
