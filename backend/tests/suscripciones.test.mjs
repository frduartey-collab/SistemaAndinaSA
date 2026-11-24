import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const ahora = Date.parse('2026-01-31T13:00:00Z');
const clave = 'Andina-Pruebas-Pagos';
const secreto = 'credencial-webhook-sintetica-pruebas-sigem';
const hash = hashPassword(clave);

async function preparar(t, opciones = {}) {
  const datos = new Datos();
  const propia = datos.crearTenant('Empresa A', 'PARTICULAR', ahora);
  const ajena = datos.crearTenant('Empresa B', 'PARTICULAR', ahora);
  const usuarios = {};
  const personas = [
    ['jefe', '11111111-1', 'JEFATURA', propia.id],
    ['ajeno', '22222222-2', 'JEFATURA', ajena.id],
    ['supervisor', '33333333-3', 'SUPERVISOR', propia.id],
    ['tecnico', '44444444-4', 'TECNICO', propia.id],
  ];
  const passwordHash = await hash;
  for (const [nombre, rut, rol, tenantId] of personas) {
    usuarios[nombre] = datos.enTenant(tenantId, () => datos.crearUsuario({ rut, nombre, rol, activo: true, passwordHash }));
  }
  const backend = await crearAplicacion({
    secret: 'secret-jwt-sintetico-pruebas-suscripciones', datos, now: () => ahora, ...opciones,
  });
  t.after(() => backend.close());
  const api = request(backend.app);
  async function token(persona) {
    const { body } = await api.post('/auth/login').send({ rut: usuarios[persona].rut, password: clave }).expect(200);
    return 'Bearer ' + body.token;
  }
  return { api, datos, propia, ajena, usuarios, token };
}

const ruta = '/suscripciones';
const firma = cuerpo => 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');

test('Solo Jefatura consulta y cambia su propia suscripción, con simulación deshabilitada por defecto', async t => {
  const f = await preparar(t);
  const jefe = await f.token('jefe');
  const otro = await f.token('ajeno');
  await f.api.get(ruta).expect(401);
  for (const cuenta of ['supervisor', 'tecnico']) {
    const token = await f.token(cuenta);
    await f.api.get(ruta).set('Authorization', token).expect(403);
    await f.api.post(ruta + '/checkout').set('Authorization', token).send({ plan: 'EMPRESA' }).expect(403);
  }
  const consulta = await f.api.get(ruta).set('Authorization', jefe).expect(200);
  assert(esquema('suscripciones', 'ResumenSuscripcion')(consulta.body));
  assert.deepEqual(consulta.body, { plan_actual: 'PARTICULAR', activa: null, pendiente: null, cobros: [], simulacion_disponible: false });
  await f.api.post(ruta + '/checkout').set('Authorization', jefe).send({ plan: 'EMPRESA', tarjeta: 'sintetica' }).expect(400);

  const checkout = () => f.api.post(ruta + '/checkout').set('Authorization', jefe).send({ plan: 'EMPRESA' }).expect(201);
  const [primero, segundo] = await Promise.all([checkout(), checkout()]);
  assert.deepEqual(primero.body, segundo.body);
  assert.equal(primero.body.monto_clp, 600_000);
  assert.equal(primero.body.puesta_marcha_clp, 2_500_000);
  const URL = ruta + '/' + primero.body.id;
  await f.api.post(URL + '/cancelar').set('Authorization', otro).expect(404);
  await f.api.post(URL + '/simular-pago').set('Authorization', jefe).expect(403);
  const cancelada = await f.api.post(URL + '/cancelar').set('Authorization', jefe).expect(200);
  assert.equal(cancelada.body.plan_actual, 'PARTICULAR');
  assert.equal(cancelada.body.pendiente, null);
  await f.api.post(ruta + '/webhook').send({}).expect(503);
});

test('El webhook verifica los bytes, cobra una sola vez por evento y renueva con el monto esperado', async t => {
  const f = await preparar(t, { pagoWebhookSecret: secreto });
  const jefe = await f.token('jefe');
  const ajeno = await f.token('ajeno');
  const { body: compra } = await f.api.post(ruta + '/checkout').set('Authorization', jefe).send({ plan: 'EMPRESA' }).expect(201);
  const evento = { evento_id: 'evt-1', suscripcion_id: compra.id, monto_clp: 3_100_000, metodo_pago_ref: 'ref-pruebas' };
  function enviar(entrada, sign = firma) {
    const raw = JSON.stringify(entrada);
    return f.api.post(ruta + '/webhook').type('json').set('x-sigem-signature', sign(raw)).send(raw);
  }
  await enviar(evento, () => firma(JSON.stringify(evento) + ' ')).expect(401);
  await f.api.post(ruta + '/webhook').set('Authorization', jefe).send(evento).expect(401);
  await enviar({ ...evento, tenant_id: f.ajena.id }).expect(400);
  const { body: incorrecto } = await enviar({ ...evento, monto_clp: 600_000 }).expect(400);
  assert.equal(incorrecto.codigo, 'MONTO_PAGO_INVALIDO');
  f.datos.db.exec(`
    CREATE TRIGGER impedir_activacion_de_prueba BEFORE UPDATE OF plan ON tenants
    WHEN NEW.plan = 'EMPRESA' BEGIN SELECT RAISE(ABORT, 'Fallo simulado'); END;
  `);
  await enviar(evento).expect(500);
  const sinCambios = await f.api.get(ruta).set('Authorization', jefe).expect(200);
  assert.equal(sinCambios.body.plan_actual, 'PARTICULAR');
  assert.equal(sinCambios.body.pendiente.id, compra.id);
  assert.deepEqual(sinCambios.body.cobros, []);
  f.datos.db.exec('DROP TRIGGER impedir_activacion_de_prueba');
  await Promise.all([enviar(evento).expect(204), enviar(evento).expect(204)]);
  await enviar({ ...evento, metodo_pago_ref: 'otro' }).expect(409);

  const primero = await f.api.get(ruta).set('Authorization', jefe).expect(200);
  assert.equal(primero.body.plan_actual, 'EMPRESA');
  assert.equal(primero.body.activa.fecha_renovacion, '2026-02-28T13:00:00.000Z');
  assert.deepEqual(primero.body.cobros.map(({ monto_clp, puesta_marcha_clp }) => [monto_clp, puesta_marcha_clp]), [[3_100_000, 2_500_000]]);
  const deOtro = await f.api.get(ruta).set('Authorization', ajeno).expect(200);
  assert.equal(deOtro.body.plan_actual, 'PARTICULAR');
  assert.deepEqual(deOtro.body.cobros, []);
  assert.equal((await f.api.get('/auth/me').set('Authorization', jefe).expect(200)).body.plan, 'EMPRESA');

  const renovar = { evento_id: 'evt-2', suscripcion_id: compra.id, monto_clp: 600_000 };
  await enviar(renovar).expect(204);
  await enviar(renovar).expect(204);
  const actualizado = await f.api.get(ruta).set('Authorization', jefe).expect(200);
  assert.equal(actualizado.body.activa.fecha_renovacion, '2026-03-28T13:00:00.000Z');
  assert.deepEqual(actualizado.body.cobros.map(cobro => cobro.monto_clp), [600_000, 3_100_000]);
});

test('La simulación es idempotente, la puesta en marcha es única y cancelar conserva equipos', async t => {
  const f = await preparar(t, { pagosSimulados: true });
  const jefe = await f.token('jefe');
  const ajeno = await f.token('ajeno');
  const checkout = plan => f.api.post(ruta + '/checkout').set('Authorization', jefe).send({ plan }).expect(201);
  const simular = id => f.api.post(ruta + '/' + id + '/simular-pago').set('Authorization', jefe).expect(200);
  const baja = id => f.api.post(ruta + '/' + id + '/cancelar').set('Authorization', jefe).expect(200);
  await f.api.post('/activos').set('Authorization', jefe).send({
    codigo: 'EQ-1501', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'MEDIA',
  }).expect(201);
  const { body: activaParticular } = await checkout('PARTICULAR');
  assert.equal(activaParticular.monto_clp, 54_990);
  await simular(activaParticular.id);
  const { body: descartada } = await checkout('EMPRESA');
  assert.equal((await baja(descartada.id)).body.activa.id, activaParticular.id);

  const { body: empresa } = await checkout('EMPRESA');
  await f.api.post(ruta + '/checkout').set('Authorization', jefe).send({ plan: 'PARTICULAR' }).expect(409);
  await f.api.post(ruta + '/' + empresa.id + '/simular-pago').set('Authorization', ajeno).expect(404);
  const [a, b] = await Promise.all([simular(empresa.id), simular(empresa.id)]);
  assert.deepEqual(a.body, b.body);
  assert.equal(a.body.activa.id, empresa.id);
  assert.equal(a.body.cobros.length, 2);
  assert.equal(a.body.cobros[0].puesta_marcha_clp, 2_500_000);
  assert.equal((await baja(activaParticular.id)).body.plan_actual, 'EMPRESA');
  const { body: cancelada } = await baja(empresa.id);
  assert.equal(cancelada.activa, null);
  assert.equal(cancelada.plan_actual, 'PARTICULAR');
  const equipos = await f.api.get('/activos').set('Authorization', jefe).expect(200);
  assert.equal(equipos.body.total, 1);
  const { body: nuevo } = await checkout('EMPRESA');
  assert.equal(nuevo.puesta_marcha_clp, 0);
  const reactivado = await simular(nuevo.id);
  assert.equal(reactivado.body.cobros[0].monto_clp, 600_000);
  assert.equal(reactivado.body.cobros.filter(cobro => cobro.puesta_marcha_clp > 0).length, 1);
});
