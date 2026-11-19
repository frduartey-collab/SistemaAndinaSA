import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const fecha = Date.parse('2026-11-19T12:00:00Z');
const clave = 'Andina-Pruebas-Evidencia';
const hash = hashPassword(clave);
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7YsAAAAASUVORK5CYII=';
const foto = { nombre: 'Evidencia.png', tipo: 'image/png', contenido_base64: png };

async function preparar(t) {
  const datos = new Datos();
  const roles = [
    ['autor', '11111111-1', 'TECNICO', true],
    ['ajeno', '22222222-2', 'TRABAJADOR', true],
    ['supervisor', '33333333-3', 'SUPERVISOR', true],
    ['jefatura', '44444444-4', 'JEFATURA', true],
    ['inactivo', '55555555-5', 'SUPERVISOR', false],
    ['bodega', '66666666-6', 'BODEGA', true],
  ];
  const usuarios = {};
  const sesiones = {};
  for (const [nombre, rut, rol, activo] of roles) {
    usuarios[nombre] = datos.crearUsuario({ nombre, rut, rol, activo, passwordHash: await hash });
  }
  const equipo = datos.crear({ codigo: 'EQ-0421', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA' }, usuarios.supervisor.id, fecha);
  let hora = fecha;
  const backend = await crearAplicacion({
    secret: 'secreto-sintetico-evidencia-pruebas-local', datos, now: () => hora,
  });
  t.after(() => backend.close());
  const api = request(backend.app);

  async function token(persona) {
    if (!sesiones[persona]) {
      const { body } = await api.post('/auth/login').send({ rut: usuarios[persona].rut, password: clave }).expect(200);
      sesiones[persona] = 'Bearer ' + body.token;
    }
    return sesiones[persona];
  }

  const reporte = { equipo_id: equipo.id, descripcion: 'La prensa no sube.' };
  return { api, datos, usuarios, token, reporte, avanzar: () => { hora += 1000; } };
}

function leerBinario(res, callback) {
  const partes = [];
  res.on('data', parte => partes.push(parte));
  res.on('error', callback);
  res.on('end', () => callback(null, Buffer.concat(partes)));
}

test('Las fotos se sirven como bytes solo al autor y a roles de supervisión', async t => {
  const f = await preparar(t);
  const autor = await f.token('autor');
  const ajeno = await f.token('ajeno');
  const supervisor = await f.token('supervisor');
  const bodega = await f.token('bodega');
  const { body } = await f.api.post('/fallas').set('Authorization', autor)
    .send({ ...f.reporte, fotos: [foto] }).expect(201);
  assert(esquema('fallas', 'FallaRespuesta')(body));
  const detalle = '/fallas/' + body.id;
  const visible = await f.api.get(detalle).set('Authorization', autor).expect(200);
  assert(esquema('fallas', 'FallaDetalleRespuesta')(visible.body));
  assert.deepEqual(visible.body.fotos, [{ id: visible.body.fotos[0].id, nombre: 'Evidencia.png', tipo: 'image/png' }]);
  await f.api.get(detalle).set('Authorization', ajeno).expect(404);
  await f.api.get(detalle).set('Authorization', bodega).expect(403);
  await f.api.get(detalle).set('Authorization', supervisor).expect(200);
  const url = detalle + '/fotos/' + visible.body.fotos[0].id;
  await f.api.get(url).expect(401);
  const oculto = await f.api.get(url).set('Authorization', ajeno).expect(404);
  assert.equal(oculto.body.codigo, 'FOTO_NO_ENCONTRADA');
  const respuesta = await f.api.get(url).set('Authorization', supervisor)
    .buffer(true).parse(leerBinario).expect(200)
    .expect('Content-Type', 'image/png')
    .expect('Cache-Control', 'no-store')
    .expect('X-Content-Type-Options', 'nosniff');
  assert.deepEqual(respuesta.body, Buffer.from(png, 'base64'));

  const otra = await f.api.post('/fallas').set('Authorization', autor).send(f.reporte).expect(201);
  const sinFotos = await f.api.get('/fallas/' + otra.body.id).set('Authorization', autor).expect(200);
  assert.deepEqual(sinFotos.body.fotos, []);
  await f.api.get('/fallas/' + otra.body.id + '/fotos/' + visible.body.fotos[0].id).set('Authorization', autor).expect(404);
});

test('El reporte exige firmas y base64 canónico y aplica límites solo después de autorizar', async t => {
  const f = await preparar(t);
  const autor = await f.token('autor');
  const bodega = await f.token('bodega');
  const reportar = fotos => f.api.post('/fallas').set('Authorization', autor).send({ ...f.reporte, fotos });
  const len = 5 * 1024 * 1024;
  const grande = Buffer.alloc(len + 1);
  Buffer.from(png, 'base64').copy(grande);
  const aceptada = { ...foto, contenido_base64: grande.subarray(0, len).toString('base64') };
  for (const invalida of [
    { ...foto, tipo: 'image/jpeg' }, { ...foto, tipo: 'image/svg+xml' },
    { ...foto, contenido_base64: ' ' + png }, { ...foto, contenido_base64: png.slice(0, -1) },
    { ...foto, nombre: '../foto.png' }, { ...foto, contenido_base64: grande.toString('base64') },
  ]) await reportar([invalida]).expect(400);
  await reportar([foto, foto, foto, foto]).expect(400);
  const cuerpoSinPermiso = { ...f.reporte, fotos: [{ ...foto, contenido_base64: aceptada.contenido_base64.slice(0, 17 * 1024) }] };
  await f.api.post('/fallas').send(cuerpoSinPermiso).expect(401);
  await f.api.post('/fallas').set('Authorization', bodega).send(cuerpoSinPermiso).expect(403);
  await f.api.post('/auth/login').send({ extra: 'x'.repeat(17 * 1024) }).expect(400);
  await reportar([aceptada, aceptada, aceptada]).expect(201);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM fallas').get().n, 1);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM fotos_falla').get().n, 3);
});

test('Cada destinatario activo recibe un aviso propio y marcarlo leído conserva la primera fecha', async t => {
  const f = await preparar(t);
  const autor = await f.token('autor');
  const supervisor = await f.token('supervisor');
  const jefatura = await f.token('jefatura');
  await f.api.get('/notificaciones').expect(401);
  await f.api.get('/notificaciones').set('Authorization', autor).expect(403);
  const { body: falla } = await f.api.post('/fallas').set('Authorization', autor).send(f.reporte).expect(201);
  assert.deepEqual(f.datos.db.prepare('SELECT usuario_id FROM notificaciones_falla ORDER BY usuario_id').all(), [
    { usuario_id: f.usuarios.supervisor.id }, { usuario_id: f.usuarios.jefatura.id },
  ]);
  const aviso = await f.api.get('/notificaciones?page=1&size=1').set('Authorization', supervisor).expect(200);
  assert(esquema('notificaciones', 'PaginaNotificaciones')(aviso.body));
  assert.equal(aviso.body.total, 1);
  const primera = aviso.body.items[0];
  assert.deepEqual(primera, {
    id: primera.id, falla_id: falla.id, equipo_codigo: 'EQ-0421', equipo_nombre: 'Prensa',
    fecha: new Date(fecha).toISOString(), leida: false,
  });
  const url = '/notificaciones/' + primera.id + '/leida';
  await f.api.patch(url).set('Authorization', jefatura).expect(404);
  await f.api.patch(url).set('Authorization', autor).expect(403);
  await f.api.patch(url).set('Authorization', supervisor).expect(204);
  f.avanzar();
  await f.api.patch(url).set('Authorization', supervisor).expect(204);
  assert.equal(f.datos.db.prepare('SELECT leida_en FROM notificaciones_falla WHERE id = ?').get(primera.id).leida_en, new Date(fecha).toISOString());
  const leidos = await f.api.get('/notificaciones').set('Authorization', supervisor).expect(200);
  const otros = await f.api.get('/notificaciones').set('Authorization', jefatura).expect(200);
  assert(leidos.body.items[0].leida);
  assert.equal(otros.body.total, 1);
  assert.equal(otros.body.items[0].leida, false);
});

test('Un fallo al generar avisos revierte la falla y sus fotografías', async t => {
  const f = await preparar(t);
  const autor = await f.token('autor');
  f.datos.db.exec("CREATE TRIGGER fallar_avisos BEFORE INSERT ON notificaciones_falla BEGIN SELECT RAISE(ABORT, 'Fallo de aviso simulado'); END");
  await f.api.post('/fallas').set('Authorization', autor).send({ ...f.reporte, fotos: [foto] }).expect(500);
  for (const tabla of ['fallas', 'fotos_falla', 'notificaciones_falla']) {
    assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM ' + tabla).get().n, 0, tabla);
  }
  f.datos.db.exec('DROP TRIGGER fallar_avisos');
  await f.api.post('/fallas').set('Authorization', autor).send({ ...f.reporte, fotos: [foto] }).expect(201);
});
