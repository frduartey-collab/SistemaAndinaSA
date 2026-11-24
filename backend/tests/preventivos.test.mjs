import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { OrdenesTrabajo } from '../dist/ordenes.js';
import { InventarioRepuestos } from '../dist/repuestos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const ahora = Date.parse('2026-11-23T15:00:00Z');
const clave = 'Andina-Preventivos-Prueba';
const hash = hashPassword(clave);
const equipoNuevo = { codigo: 'EQ-4010', nombre: 'Prensa', ubicacion: 'Norte', criticidad: 'ALTA' };
const calendario = { descripcion: 'Revisar lubricación', tipo_disparador: 'FECHA', intervalo_dias: 2, proxima_fecha: '2026-11-21' };

async function configurar(t) {
  const datos = new Datos();
  const particular = datos.crearTenant('Taller', 'PARTICULAR', ahora);
  const usuarios = {};
  const personas = [
    ['jefatura', '11111111-1', 'JEFATURA', 1],
    ['tecnico', '22222222-2', 'TECNICO', 1],
    ['otro', '33333333-3', 'TECNICO', 1],
    ['bodega', '44444444-4', 'BODEGA', 1],
    ['jefaParticular', '55555555-5', 'JEFATURA', particular.id],
    ['tecnicoParticular', '66666666-6', 'TECNICO', particular.id],
  ];
  const passwordHash = await hash;
  for (const [nombre, rut, rol, tenantId] of personas) {
    usuarios[nombre] = datos.enTenant(tenantId, () => datos.crearUsuario({ rut, nombre, rol, activo: true, passwordHash }));
  }
  const equipo = datos.crear(equipoNuevo, usuarios.jefatura.id, ahora);
  const equipoParticular = datos.enTenant(particular.id, () => datos.crear(equipoNuevo, usuarios.jefaParticular.id, ahora));
  const backend = await crearAplicacion({ secret: 'secreto-sintetico-preventivos-prueba', datos, now: () => ahora });
  t.after(() => backend.close());
  const api = request(backend.app);
  async function token(persona) {
    const { body } = await api.post('/auth/login').send({ rut: usuarios[persona].rut, password: clave }).expect(200);
    return 'Bearer ' + body.token;
  }
  return { datos, particular, equipo, equipoParticular, usuarios, api, backend, token };
}

test('Un plan de calendario genera una OT real una sola vez y se cierra con inventario', async t => {
  const f = await configurar(t);
  const jefe = await f.token('jefatura');
  const tecnico = await f.token('tecnico');
  const otro = await f.token('otro');
  const bodega = await f.token('bodega');
  const jefeAjeno = await f.token('jefaParticular');
  const entrada = { ...calendario, equipo_id: f.equipo.id, tecnico_id: f.usuarios.tecnico.id };
  const crear = (auth, datos = entrada) => f.api.post('/preventivos').set('Authorization', auth).send(datos);

  await f.api.get('/preventivos').expect(401);
  await f.api.get('/preventivos').set('Authorization', bodega).expect(403);
  await crear(tecnico).expect(403);
  await crear(jefe, { ...entrada, equipo_id: f.equipoParticular.id }).expect(404);
  await crear(jefe, { ...entrada, tecnico_id: f.usuarios.tecnicoParticular.id }).expect(409);
  await crear(jefe, { ...entrada, intervalo_horas: 5 }).expect(400);
  const { body: plan } = await crear(jefe).expect(201);
  assert(esquema('preventivos', 'PlanPreventivoRespuesta')(plan));
  assert.equal(plan.alerta_vencimiento, true);
  assert.equal(plan.orden_abierta_id, null);
  assert.deepEqual((await f.api.get('/preventivos').set('Authorization', tecnico).expect(200)).body, [plan]);
  assert.deepEqual((await f.api.get('/preventivos').set('Authorization', otro).expect(200)).body, []);
  assert.deepEqual((await f.api.get('/preventivos').set('Authorization', jefeAjeno).expect(200)).body, []);
  await f.api.patch('/preventivos/' + plan.id).set('Authorization', jefeAjeno).send({ activo: false }).expect(404);

  const evaluar = () => f.api.post('/preventivos/evaluar').set('Authorization', jefe).expect(200);
  const resultado = await Promise.all([evaluar(), evaluar()]);
  assert.deepEqual(resultado.map(res => res.body.generadas).sort(), [0, 1]);
  const id = resultado.find(res => res.body.generadas).body.ordenes_ids[0];
  const ruta = '/ordenes/' + id;
  const { body: orden } = await f.api.get(ruta).set('Authorization', tecnico).expect(200);
  assert(esquema('ordenes', 'OrdenDetalleRespuesta')(orden));
  assert.equal(orden.falla_id, null);
  assert.equal(orden.plan_preventivo_id, plan.id);
  assert.equal(orden.descripcion, calendario.descripcion);
  assert.equal(orden.equipo_codigo, f.equipo.codigo);
  assert.equal(orden.prioridad, 'ALTA');
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM fallas').get().n, 0);
  await f.api.get(ruta).set('Authorization', otro).expect(404);
  const { body: planes } = await f.api.get('/preventivos').set('Authorization', tecnico).expect(200);
  assert.equal(planes[0].orden_abierta_id, id);
  assert.equal(planes[0].proxima_fecha, '2026-11-25');
  assert.equal(planes[0].alerta_vencimiento, true);

  const { body: repuesto } = await f.api.post('/repuestos').set('Authorization', jefe)
    .send({ codigo: 'GRASA-1', nombre: 'Grasa', stock_minimo: 0 }).expect(201);
  await f.api.post('/repuestos/' + repuesto.id + '/movimientos').set('Authorization', jefe).send({ tipo: 'ENTRADA', cantidad: 1 }).expect(201);
  await f.api.patch(ruta + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  const { body: cerrada } = await f.api.put(ruta + '/cierre').set('Authorization', tecnico).send({
    diagnostico: 'Lubricación preventiva', solucion: 'Se lubricó', duracion_minutos: 10,
    repuestos_consumidos: [{ repuesto_id: repuesto.id, cantidad: 1 }],
  }).expect(200);
  assert.equal(cerrada.estado, 'CERRADA');
  assert.equal(cerrada.intervencion.repuestos_consumidos[0].cantidad, 1);
  assert.equal((await f.api.get('/repuestos/' + repuesto.id).set('Authorization', jefe).expect(200)).body.stock_actual, 0);
  assert.equal((await evaluar()).body.generadas, 0);
});

test('Horas de uso y alertas requieren Empresa y el programador evalúa cada empresa activa', async t => {
  const f = await configurar(t);
  const jefe = await f.token('jefatura');
  const particular = await f.token('jefaParticular');
  const ruta = '/preventivos';
  const horas = { descripcion: 'Control de horas', tipo_disparador: 'HORAS_USO', intervalo_horas: 10, proximas_horas: 25 };
  const crear = (auth, datos) => f.api.post(ruta).set('Authorization', auth).send(datos);

  await crear(particular, { ...horas, equipo_id: f.equipoParticular.id, tecnico_id: f.usuarios.tecnicoParticular.id }).expect(403);
  const { body: planParticular } = await crear(particular, {
    ...calendario, equipo_id: f.equipoParticular.id, tecnico_id: f.usuarios.tecnicoParticular.id,
  }).expect(201);
  assert.equal(planParticular.alerta_vencimiento, false);
  const { body: planHoras } = await crear(jefe, { ...horas, equipo_id: f.equipo.id, tecnico_id: f.usuarios.tecnico.id }).expect(201);
  assert.equal(planHoras.alerta_vencimiento, false);
  await f.api.patch('/activos/' + f.equipo.id).set('Authorization', jefe).send({ uso_acumulado_horas: 42.5 }).expect(200);

  f.datos.db.prepare("UPDATE tenants SET estado = 'INACTIVO' WHERE id = ?").run(f.particular.id);
  f.backend.evaluarPreventivosProgramados((id, error) => { throw new Error(String(id), { cause: error }); });
  const { body: planes } = await f.api.get(ruta).set('Authorization', jefe).expect(200);
  assert.equal(planes[0].proximas_horas, 45);
  assert(planes[0].orden_abierta_id);
  assert.equal(planes[0].alerta_vencimiento, true);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM ordenes_trabajo WHERE tenant_id = ?').get(f.particular.id).n, 0);

  f.datos.db.prepare("UPDATE tenants SET estado = 'ACTIVO' WHERE id = ?").run(f.particular.id);
  await f.api.patch(ruta + '/' + planParticular.id).set('Authorization', particular).send({ activo: false }).expect(200);
  f.backend.evaluarPreventivosProgramados((id, error) => { throw new Error(String(id), { cause: error }); });
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM ordenes_trabajo').get().n, 1);
});

test('La migración preserva IDs y restricciones de las órdenes correctivas', async t => {
  const datos = new Datos();
  const fallas = new Fallas(datos);
  const inventario = new InventarioRepuestos(datos);
  new OrdenesTrabajo(datos, inventario);
  datos.migrarTenantsOperativos();
  const passwordHash = await hash;
  const jefe = datos.crearUsuario({ rut: '11111111-1', nombre: 'Berta', rol: 'JEFATURA', activo: true, passwordHash });
  const tecnico = datos.crearUsuario({ rut: '22222222-2', nombre: 'Mateo', rol: 'TECNICO', activo: true, passwordHash });
  const equipo = datos.crear(equipoNuevo, jefe.id, ahora);
  const falla = fallas.crear({ equipo_id: equipo.id, descripcion: 'Fuga' }, tecnico.id, ahora);
  datos.db.prepare("INSERT INTO ordenes_trabajo(id,falla_id,tecnico_id,fecha_limite,estado) VALUES (88,?,?,'2026-11-25','CERRADA')")
    .run(falla.id, tecnico.id);

  const backend = await crearAplicacion({ secret: 'secreto-sintetico-migracion-preventiva', datos, now: () => ahora });
  t.after(() => backend.close());
  const api = request(backend.app);
  const login = await api.post('/auth/login').send({ rut: jefe.rut, password: clave }).expect(200);
  const { body } = await api.get('/ordenes/88').set('Authorization', 'Bearer ' + login.body.token).expect(200);
  assert.equal(body.falla_id, falla.id);
  assert.equal(body.plan_preventivo_id, undefined);
  assert.equal(body.estado, 'CERRADA');
  assert.throws(() => datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'PENDIENTE' WHERE id = 88").run(), /inmutable/);
  assert.deepEqual(datos.db.pragma('foreign_key_check'), []);
});
