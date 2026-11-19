import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const ahora = Date.parse('2026-11-19T12:00:00Z');
const clave = 'Andina-Inventario-Prueba';
const hash = hashPassword(clave);
const intervencion = { diagnostico: 'Fuga detectada', solucion: 'Se cambió el sello', duracion_minutos: 25 };

async function preparar(t) {
  const datos = new Datos();
  const roles = [
    ['11111111-1', 'JEFATURA'],
    ['22222222-2', 'BODEGA'],
    ['33333333-3', 'TECNICO'],
    ['44444444-4', 'SUPERVISOR'],
    ['55555555-5', 'TRABAJADOR'],
  ];
  const backend = await crearAplicacion({
    secret: 'secreto-sintetico-inventario-pruebas-locales', datos, now: () => ahora,
  });
  t.after(() => backend.close());
  const api = request(backend.app);
  const usuarios = {};
  const token = {};

  for (const [rut, rol] of roles) {
    usuarios[rol] = datos.crearUsuario({ rut, rol, nombre: rol, activo: true, passwordHash: await hash });
  }
  async function sesion(rol) {
    if (!token[rol]) {
      const { body } = await api.post('/auth/login').send({ rut: usuarios[rol].rut, password: clave }).expect(200);
      token[rol] = 'Bearer ' + body.token;
    }
    return token[rol];
  }

  const jefe = await sesion('JEFATURA');
  const bodega = await sesion('BODEGA');
  const tecnico = await sesion('TECNICO');

  async function repuesto(codigo, nombre, stock = 0) {
    const { body } = await api.post('/repuestos').set('Authorization', bodega)
      .send({ codigo, nombre, stock_minimo: 2 }).expect(201);
    if (stock > 0) {
      await api.post('/repuestos/' + body.id + '/movimientos').set('Authorization', bodega)
        .send({ tipo: 'ENTRADA', cantidad: stock }).expect(201);
    }
    return body.id;
  }

  async function orden() {
    const equipo = datos.crear({ codigo: 'EQ-0334', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA' }, usuarios.JEFATURA.id, ahora);
    const falla = await api.post('/fallas').set('Authorization', tecnico)
      .send({ equipo_id: equipo.id, descripcion: 'La prensa pierde presión.' }).expect(201);
    const { body } = await api.post('/ordenes').set('Authorization', jefe)
      .send({ falla_id: falla.body.id, tecnico_id: usuarios.TECNICO.id, fecha_limite: '2026-11-20' }).expect(201);
    const ruta = '/ordenes/' + body.id;
    await api.patch(ruta + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
    return ruta;
  }

  async function stock(id) {
    const { body } = await api.get('/repuestos/' + id).set('Authorization', bodega).expect(200);
    return body.stock_actual;
  }

  return { api, datos, jefe, bodega, tecnico, sesion, repuesto, orden, stock };
}

test('Catálogo vigente respeta roles, código inmutable, paginación y baja con stock cero', async t => {
  const f = await preparar(t);
  const entrada = { codigo: 'roda-01', nombre: ' Rodamiento ', descripcion: '  Roller  ', stock_minimo: 2 };
  await f.api.get('/repuestos').expect(401);
  for (const rol of ['SUPERVISOR', 'TRABAJADOR']) {
    await f.api.get('/repuestos').set('Authorization', await f.sesion(rol)).expect(403);
  }
  await f.api.post('/repuestos').set('Authorization', f.tecnico).send(entrada).expect(403);
  const { body } = await f.api.post('/repuestos').set('Authorization', f.bodega).send(entrada).expect(201);
  assert(esquema('repuestos', 'RepuestoRespuesta')(body));
  assert.deepEqual(body, {
    id: body.id, codigo: 'RODA-01', nombre: 'Rodamiento', descripcion: 'Roller', stock_actual: 0, stock_minimo: 2,
  });
  const ruta = '/repuestos/' + body.id;
  await f.repuesto('SELLO-01', 'Sello con stock', 1);
  const listado = await f.api.get('/repuestos').set('Authorization', f.tecnico)
    .query({ page: 1, size: 1, q: 'rodam' }).expect(200);
  assert(esquema('repuestos', 'PaginaRepuestos')(listado.body));
  assert.deepEqual(listado.body, { items: [body], page: 1, size: 1, total: 1 });
  const edicion = { nombre: 'Rodamiento nuevo', stock_minimo: 3 };
  await f.api.put(ruta).set('Authorization', f.tecnico).send(edicion).expect(403);
  await f.api.put(ruta).set('Authorization', f.jefe).send({ ...edicion, codigo: 'OTRO' }).expect(400);
  const { body: editado } = await f.api.put(ruta).set('Authorization', f.jefe).send(edicion).expect(200);
  assert.equal(editado.codigo, body.codigo);
  assert.equal(editado.stock_minimo, 3);
  assert.equal(editado.descripcion, null);

  const stockPositivo = await f.api.get('/repuestos?q=SELLO').set('Authorization', f.bodega).expect(200);
  const conStock = await f.api.delete('/repuestos/' + stockPositivo.body.items[0].id).set('Authorization', f.jefe).expect(409);
  assert.equal(conStock.body.codigo, 'REPUESTO_CON_STOCK');
  await f.api.delete(ruta).set('Authorization', f.tecnico).expect(403);
  await f.api.delete(ruta).set('Authorization', f.jefe).expect(204);
  await f.api.get(ruta).set('Authorization', f.tecnico).expect(404);
  assert((await f.api.get('/repuestos').set('Authorization', f.bodega).expect(200)).body.items.every(item => item.id !== body.id));
  const duplicado = await f.api.post('/repuestos').set('Authorization', f.bodega).send(entrada).expect(409);
  assert.equal(duplicado.body.codigo, 'CODIGO_DUPLICADO');
  assert(f.datos.db.prepare('SELECT deleted_at FROM repuestos WHERE id = ?').get(body.id).deleted_at);
});

test('Movimientos controlados mantienen stock no negativo y registran la auditoría', async t => {
  const f = await preparar(t);
  const id = await f.repuesto('CORREA-1', 'Correa', 5);
  const ruta = '/repuestos/' + id + '/movimientos';
  const mover = (token, body) => f.api.post(ruta).set('Authorization', token).send(body);
  await mover(f.tecnico, { tipo: 'ENTRADA', cantidad: 100 }).expect(403);
  for (const cantidad of [0, -2, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await mover(f.bodega, { tipo: 'SALIDA', cantidad }).expect(400);
  }
  await mover(f.bodega, { tipo: 'ENTRADA', cantidad: Number.MAX_SAFE_INTEGER }).expect(400);
  assert.equal((await mover(f.jefe, { tipo: 'SALIDA', cantidad: 3, motivo: ' Ajuste ' }).expect(201)).body.stock_actual, 2);
  const { body } = await mover(f.bodega, { tipo: 'SALIDA', cantidad: 3 }).expect(400);
  assert.equal(body.codigo, 'STOCK_INSUFICIENTE');
  assert.match(body.mensaje, /Correa.*2/);
  assert.equal(await f.stock(id), 2);
  assert.deepEqual(f.datos.db.prepare(
    'SELECT tipo, cantidad, motivo FROM movimientos_repuestos WHERE repuesto_id = ? ORDER BY id',
  ).all(id), [{ tipo: 'ENTRADA', cantidad: 5, motivo: null }, { tipo: 'SALIDA', cantidad: 3, motivo: 'Ajuste' }]);
  assert.equal(f.datos.db.prepare("SELECT count(*) AS n FROM auditoria WHERE accion LIKE 'REPUESTO_MOVIMIENTO_%'").get().n, 2);
});

test('Cierre rechaza consumo duplicado o stock insuficiente y guarda todos los descuentos sin repetirlos', async t => {
  const f = await preparar(t);
  const id1 = await f.repuesto('SELLO-1', 'Sello', 3);
  const id2 = await f.repuesto('GRASA-1', 'Grasa', 1);
  const ruta = await f.orden();
  const cerrar = repuestos_consumidos => f.api.put(ruta + '/cierre').set('Authorization', f.tecnico)
    .send({ ...intervencion, repuestos_consumidos });
  const consumos = [{ repuesto_id: id1, cantidad: 2 }, { repuesto_id: id2, cantidad: 1 }];

  const duplicado = await cerrar([consumos[0], { ...consumos[0], cantidad: 1 }]).expect(400);
  assert.equal(duplicado.body.codigo, 'DATOS_INVALIDOS');
  const insuficiente = await cerrar([consumos[0], { ...consumos[1], cantidad: 2 }]).expect(400);
  assert.equal(insuficiente.body.codigo, 'STOCK_INSUFICIENTE');
  assert.match(insuficiente.body.mensaje, /Grasa.*1/);
  await cerrar([consumos[0], { repuesto_id: 999, cantidad: 1 }]).expect(404);
  assert.equal(await f.stock(id1), 3);
  const previo = await f.api.get(ruta).set('Authorization', f.tecnico).expect(200);
  assert.equal(previo.body.estado, 'EN_PROGRESO');
  assert.equal(previo.body.intervencion, null);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM movimientos_repuestos WHERE orden_id IS NOT NULL').get().n, 0);

  const [primero, segundo] = await Promise.all([cerrar(consumos).expect(200), cerrar([...consumos].reverse()).expect(200)]);
  assert.deepEqual(primero.body, segundo.body);
  assert(esquema('ordenes', 'OrdenDetalleRespuesta')(primero.body));
  assert.deepEqual(primero.body.intervencion.repuestos_consumidos, [
    { ...consumos[0], codigo: 'SELLO-1', nombre: 'Sello' }, { ...consumos[1], codigo: 'GRASA-1', nombre: 'Grasa' },
  ]);
  assert.equal(await f.stock(id1), 1);
  assert.equal(await f.stock(id2), 0);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM movimientos_repuestos WHERE orden_id IS NOT NULL').get().n, 2);
  assert.equal((await cerrar([consumos[0]]).expect(409)).body.codigo, 'ORDEN_YA_CERRADA');

  await f.api.put('/repuestos/' + id2).set('Authorization', f.bodega).send({ nombre: 'Grasa editada', stock_minimo: 1 }).expect(200);
  await f.api.delete('/repuestos/' + id2).set('Authorization', f.bodega).expect(204);
  const historico = await f.api.get(ruta).set('Authorization', f.jefe).expect(200);
  assert.deepEqual(historico.body, primero.body);
  assert.deepEqual((await cerrar(consumos).expect(200)).body, primero.body);
  assert.throws(() => f.datos.db.prepare('UPDATE orden_repuesto SET nombre = ?').run('alterado'), /inmutable/);
});

test('Fallo al registrar auditoría revierte inventario, consumo, intervención y cierre', async t => {
  const f = await preparar(t);
  const id = await f.repuesto('RET-02', 'Retén', 2);
  const ruta = await f.orden();
  const cierre = { ...intervencion, repuestos_consumidos: [{ repuesto_id: id, cantidad: 2 }] };
  f.datos.db.exec("CREATE TRIGGER abortar_cierre BEFORE INSERT ON auditoria WHEN NEW.accion = 'ORDEN_CERRADA_CON_INTERVENCION' BEGIN SELECT RAISE(ABORT, 'Error de prueba'); END");
  await f.api.put(ruta + '/cierre').set('Authorization', f.tecnico).send(cierre).expect(500);
  assert.equal(await f.stock(id), 2);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM movimientos_repuestos WHERE orden_id IS NOT NULL').get().n, 0);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM orden_repuesto').get().n, 0);
  const { body } = await f.api.get(ruta).set('Authorization', f.tecnico).expect(200);
  assert.equal(body.intervencion, null);
  assert.equal(body.estado, 'EN_PROGRESO');
  f.datos.db.exec('DROP TRIGGER abortar_cierre');
  await f.api.put(ruta + '/cierre').set('Authorization', f.tecnico).send(cierre).expect(200);
  assert.equal(await f.stock(id), 0);
});
