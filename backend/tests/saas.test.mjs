import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';

const SECRET = 'secreto-de-pruebas-sigem-multi-tenant-seguro';
const CLAVE = 'Sigem-Prueba-Tenants!';
const hash = hashPassword(CLAVE);
const equipo = codigo => ({ codigo, nombre: 'Bomba', ubicacion: 'Planta', criticidad: 'ALTA' });

async function preparar(t) {
  const datos = new Datos();
  const backend = await crearAplicacion({ secret: SECRET, datos });
  t.after(() => backend.close());
  datos.crearUsuario({ rut: '11111111-1', nombre: 'Administradora', rol: 'JEFATURA', activo: true, passwordHash: await hash });
  const api = request(backend.app);

  async function entrar(rut) {
    const { body } = await api.post('/auth/login').send({ rut, password: CLAVE }).expect(200);
    return { token: 'Bearer ' + body.token, usuario: body.usuario };
  }

  async function alta(rut, nombre_empresa) {
    const { body } = await api.post('/auth/register')
      .send({ rut, password: CLAVE, nombre: 'Responsable', nombre_empresa, rol: 'JEFATURA' }).expect(201);
    assert.equal(body.plan, 'PARTICULAR');
    return entrar(rut);
  }

  return { api, datos, entrar, alta, empresa: await entrar('11111111-1') };
}

test('Separación por sesión: usuarios, catálogos, fallas, órdenes, repuestos, historial y avisos', async t => {
  const f = await preparar(t);
  const a = f.empresa.token;
  const b = await f.alta('22222222-2', 'Cliente aislado');
  assert.notEqual(f.empresa.usuario.tenant_id, b.usuario.tenant_id);
  assert.equal(f.empresa.usuario.plan, 'EMPRESA');

  const creadoA = (await f.api.post('/activos').set('Authorization', a).send(equipo('EQ-0001')).expect(201)).body;
  const creadoB = (await f.api.post('/equipos').set('Authorization', b.token).send(equipo('EQ-0001')).expect(201)).body;
  const lista = await f.api.get('/activos').set('Authorization', b.token)
    .set('X-Tenant-Id', String(f.empresa.usuario.tenant_id)).expect(200);
  assert.deepEqual(lista.body.items.map(x => x.id), [creadoB.id]);
  await f.api.get('/activos/' + creadoA.id).set('Authorization', b.token).expect(404);
  await f.api.patch('/activos/' + creadoA.id).set('Authorization', b.token).send({ nombre: 'Ajeno' }).expect(404);
  await f.api.delete('/activos/' + creadoA.id).set('Authorization', b.token).expect(404);
  await f.api.get('/equipos/' + creadoA.id + '/historial').set('Authorization', b.token).expect(404);
  await f.api.post('/fallas').set('Authorization', b.token)
    .send({ equipo_id: creadoA.id, descripcion: 'Orden ajena' }).expect(404);

  const falla = (await f.api.post('/fallas').set('Authorization', a)
    .send({ equipo_id: creadoA.id, descripcion: 'Falla privada',
      fotos: [{ nombre: 'bomba.png', tipo: 'image/png', contenido_base64: 'iVBORw0KGgo=' }] }).expect(201)).body;
  await f.api.get('/fallas/' + falla.id).set('Authorization', b.token).expect(404);
  const detalle = (await f.api.get('/fallas/' + falla.id).set('Authorization', a).expect(200)).body;
  await f.api.get('/fallas/' + falla.id + '/fotos/' + detalle.fotos[0].id).set('Authorization', b.token).expect(404);
  assert.equal((await f.api.get('/fallas').set('Authorization', b.token)).body.total, 0);

  await f.api.post('/auth/register').set('Authorization', a)
    .send({ rut: '33333333-3', password: CLAVE, nombre: 'Técnico A', rol: 'TECNICO' }).expect(201);
  const tecnico = await f.entrar('33333333-3');
  const orden = (await f.api.post('/ordenes').set('Authorization', a)
    .send({ falla_id: falla.id, tecnico_id: tecnico.usuario.id, fecha_limite: '2099-12-31' }).expect(201)).body;
  await f.api.get('/ordenes/' + orden.id).set('Authorization', b.token).expect(404);
  await f.api.patch('/ordenes/' + orden.id + '/estado').set('Authorization', b.token)
    .send({ estado: 'EN_PROGRESO' }).expect(404);
  assert.deepEqual((await f.api.get('/ordenes/tecnicos').set('Authorization', b.token).expect(200)).body.items, []);
  assert.equal((await f.api.get('/ordenes').set('Authorization', b.token).expect(200)).body.total, 0);

  const repuestoA = (await f.api.post('/repuestos').set('Authorization', a)
    .send({ codigo: 'REP-1', nombre: 'Sello A', stock_minimo: 0 }).expect(201)).body;
  const repuestoB = (await f.api.post('/repuestos').set('Authorization', b.token)
    .send({ codigo: 'REP-1', nombre: 'Sello B', stock_minimo: 0 }).expect(201)).body;
  await f.api.post('/repuestos/' + repuestoA.id + '/movimientos').set('Authorization', b.token)
    .send({ tipo: 'ENTRADA', cantidad: 4 }).expect(404);
  await f.api.post('/repuestos/' + repuestoB.id + '/movimientos').set('Authorization', b.token)
    .send({ tipo: 'ENTRADA', cantidad: 4 }).expect(201);
  await f.api.patch('/ordenes/' + orden.id + '/estado').set('Authorization', tecnico.token)
    .send({ estado: 'EN_PROGRESO' }).expect(200);
  await f.api.put('/ordenes/' + orden.id + '/cierre').set('Authorization', tecnico.token)
    .send({ diagnostico: 'Desgaste', solucion: 'Cambio', duracion_minutos: 15,
      repuestos_consumidos: [{ repuesto_id: repuestoB.id, cantidad: 1 }] }).expect(404);
  assert.equal((await f.api.get('/repuestos/' + repuestoB.id).set('Authorization', b.token)).body.stock_actual, 4);
  assert.equal((await f.api.get('/ordenes/' + orden.id).set('Authorization', a)).body.estado, 'EN_PROGRESO');

  const aviso = (await f.api.get('/notificaciones').set('Authorization', a).expect(200)).body.items[0];
  assert.equal((await f.api.get('/notificaciones').set('Authorization', b.token).expect(200)).body.total, 0);
  await f.api.patch('/notificaciones/' + aviso.id + '/leida').set('Authorization', b.token).expect(404);
  await f.api.get('/auth/me').set('Authorization', b.token).expect(200)
    .expect(res => assert.equal(res.body.tenant_id,b.usuario.tenant_id));
});

test('Particular aplica el cupo de 15 vigentes atómicamente y la baja libera un cupo', async t => {
  const f = await preparar(t);
  const b = await f.alta('22222222-2', 'Cliente con cupo');
  for (let n = 1; n <= 14; n++) {
    await f.api.post('/activos').set('Authorization', b.token).send(equipo('EQ-' + String(n).padStart(4,'0'))).expect(201);
  }
  const respuestas = await Promise.all([
    f.api.post('/equipos').set('Authorization', b.token).send(equipo('EQ-0015')),
    f.api.post('/activos').set('Authorization', b.token).send(equipo('EQ-0016')),
  ]);
  assert.deepEqual(respuestas.map(r => r.status).sort(), [201, 403]);
  assert.equal(respuestas.find(r => r.status === 403).body.codigo, 'CUPO_EQUIPOS_ALCANZADO');
  assert.equal((await f.api.get('/activos').set('Authorization', b.token).expect(200)).body.total, 15);
  await f.api.delete('/activos/' + respuestas.find(r => r.status === 201).body.id).set('Authorization', b.token).expect(204);
  await f.api.post('/activos').set('Authorization', b.token).send(equipo('EQ-0017')).expect(201);
  const vigentesEmpresa = [];
  for (let n = 1; n <= 16; n++) {
    const { body } = await f.api.post('/activos').set('Authorization', f.empresa.token)
      .send(equipo('EQ-' + String(n).padStart(4, '0'))).expect(201);
    vigentesEmpresa.push(body.id);
  }
  f.datos.db.prepare("UPDATE tenants SET plan = 'PARTICULAR' WHERE id = ?").run(f.empresa.usuario.tenant_id);
  const propios = await f.api.get('/activos').set('Authorization', f.empresa.token).expect(200);
  assert.equal(propios.body.total, 16);
  assert.deepEqual(propios.body.items.map(activo => activo.id).sort(), [...vigentesEmpresa].sort());
  const intentarAlta = () => f.api.post('/activos').set('Authorization', f.empresa.token).send(equipo('EQ-0017'));
  await intentarAlta().expect(403);
  await f.api.delete('/activos/' + vigentesEmpresa[0]).set('Authorization', f.empresa.token).expect(204);
  await intentarAlta().expect(403);
  await f.api.delete('/activos/' + vigentesEmpresa[1]).set('Authorization', f.empresa.token).expect(204);
  await intentarAlta().expect(201);
});

test('Empresa administra sedes por cliente y solo puede asignar sedes propias', async t => {
  const f = await preparar(t);
  const b = await f.alta('22222222-2', 'Segunda empresa');
  const a = f.empresa.token;
  const ficha = { nombre: 'Planta Norte', direccion: 'Calle Uno 12' };
  const sedeA = (await f.api.post('/sedes').set('Authorization', a).send(ficha).expect(201)).body;
  const bloqueado = await f.api.get('/sedes').set('Authorization', b.token).expect(403);
  assert.equal(bloqueado.body.codigo, 'PLAN_EMPRESA_REQUERIDO');
  await f.api.post('/activos').set('Authorization', b.token)
    .send({ ...equipo('EQ-0010'), sede_id: sedeA.id }).expect(403);
  f.datos.db.prepare("UPDATE tenants SET plan = 'EMPRESA' WHERE id = ?").run(b.usuario.tenant_id);
  await f.api.get('/sedes/' + sedeA.id).set('Authorization', b.token).expect(404);
  await f.api.put('/sedes/' + sedeA.id).set('Authorization', b.token).send(ficha).expect(404);
  await f.api.delete('/sedes/' + sedeA.id).set('Authorization', b.token).expect(404);
  await f.api.post('/activos').set('Authorization', b.token)
    .send({ ...equipo('EQ-0010'), sede_id: sedeA.id }).expect(404);
  const sedeB = (await f.api.post('/sedes').set('Authorization', b.token).send(ficha).expect(201)).body;
  const activo = (await f.api.post('/activos').set('Authorization',b.token)
    .send({ ...equipo('EQ-0010'), sede_id: sedeB.id }).expect(201)).body;
  assert.equal(activo.sede_id,sedeB.id);
  await f.api.delete('/sedes/' + sedeB.id).set('Authorization', b.token).expect(409);
  await f.api.patch('/activos/' + activo.id).set('Authorization', b.token).send({ sede_id: sedeA.id }).expect(404);
  await f.api.patch('/activos/' + activo.id).set('Authorization', b.token).send({ sede_id: null }).expect(200);
  await f.api.put('/sedes/' + sedeB.id).set('Authorization',b.token).send({...ficha,nombre:'Planta Central'}).expect(200);
  await f.api.delete('/sedes/' + sedeB.id).set('Authorization', b.token).expect(204);
  assert.deepEqual((await f.api.get('/sedes').set('Authorization', a).expect(200)).body, [sedeA]);
  f.datos.db.prepare("UPDATE tenants SET estado = 'INACTIVO' WHERE id = ?").run(b.usuario.tenant_id);
  await f.api.get('/auth/me').set('Authorization', b.token).expect(401);
});
