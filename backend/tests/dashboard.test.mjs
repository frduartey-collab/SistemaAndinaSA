import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { InventarioRepuestos } from '../dist/repuestos.js';
import { OrdenesTrabajo } from '../dist/ordenes.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

test('Dashboard aísla clientes, conserva ceros y calcula indicadores de intervención y vencimiento', async t => {
  const datos = new Datos();
  let ahora = Date.parse('2026-11-23T12:00:00Z');
  const backend = await crearAplicacion({ datos, now: () => ahora, secret: 'Dashboard-Prueba-Temporal-2026-256-bits' });
  t.after(() => backend.close());
  const api = request(backend.app);
  const password = 'Prueba-Dashboard!';
  const passwordHash = await hashPassword(password);
  const alta = (rut, rol) => datos.crearUsuario({ rut, rol, nombre: rol, activo: true, passwordHash });
  const responsable = alta('11111111-1', 'JEFATURA');
  const tecnico = alta('22222222-2', 'TECNICO');
  const ajeno = datos.crearTenant('Otra planta', 'EMPRESA', ahora);
  datos.enTenant(ajeno.id, () => alta('33333333-3', 'JEFATURA'));
  const entrar = async rut => 'Bearer ' + (await api.post('/auth/login').send({rut,password}).expect(200)).body.token;
  const admin = await entrar(responsable.rut);
  const tech = await entrar(tecnico.rut);
  const fuera = await entrar('33333333-3');
  await api.get('/dashboard/metricas').expect(401);
  await api.get('/dashboard/metricas').set('Authorization',tech).expect(403);
  const vacio = (await api.get('/dashboard/metricas').set('Authorization',fuera).expect(200)).body;
  assert.equal(vacio.ordenes_abiertas,0);
  assert.equal(vacio.mttr_minutos,null);
  assert.equal(vacio.cumplimiento_preventivo_pct,null);

  const equipo = datos.crear({codigo:'EQ-0030',nombre:'Compresor',ubicacion:'Planta',criticidad:'ALTA'},responsable.id,ahora);
  const fallas = new Fallas(datos);
  const ordenes = new OrdenesTrabajo(datos, new InventarioRepuestos(datos));
  for (const n of [1,2]) {
    const f = fallas.crear({equipo_id:equipo.id,descripcion:'Falla repetida ' + n},responsable.id,ahora);
    const o = ordenes.crear({falla_id:f.id,tecnico_id:tecnico.id,fecha_limite:'2026-11-23'},responsable.id,ahora);
    if (n === 1) {
      ordenes.cambiarEstado(o.id,'EN_PROGRESO',tecnico.id,false,ahora);
      ordenes.cerrar(o.id,{diagnostico:'Sello dañado',solucion:'Reemplazo',duracion_minutos:90},tecnico.id,ahora);
    }
  }
  await api.post('/preventivos').set('Authorization',admin).send({
    equipo_id:equipo.id,tecnico_id:tecnico.id,descripcion:'Revisión',tipo_disparador:'FECHA',intervalo_dias:7,proxima_fecha:'2026-11-23',
  }).expect(201);
  const generado=(await api.post('/preventivos/evaluar').set('Authorization',admin).expect(200)).body;
  const preventiva=generado.ordenes_ids[0];
  ordenes.cambiarEstado(preventiva,'EN_PROGRESO',tecnico.id,false,ahora);
  ordenes.cerrar(preventiva,{diagnostico:'Inspección',solucion:'Limpieza',duracion_minutos:15},tecnico.id,ahora);
  ahora += 86400000;
  const m=(await api.get('/dashboard/metricas').set('Authorization',await entrar(responsable.rut)).expect(200)).body;
  assert(esquema('dashboard','MetricasDashboard')(m));
  assert.equal(m.ordenes_abiertas,1);
  assert.equal(m.ordenes_vencidas,1);
  assert.equal(m.mttr_minutos,90);
  assert.deepEqual(m.fallas_recurrentes,[{equipo_id:equipo.id,equipo_codigo:'EQ-0030',equipo_nombre:'Compresor',total:2}]);
  assert.equal(m.cumplimiento_preventivo_pct,100);
  assert.deepEqual((await api.get('/dashboard/metricas').set('Authorization',await entrar('33333333-3')).expect(200)).body,vacio);
});

test('Empresa consolida y filtra por sede respetando el alcance vigente de Supervisor', async t => {
  const datos = new Datos();
  const ahora = Date.parse('2026-11-23T12:00:00Z');
  const backend = await crearAplicacion({ datos, now: () => ahora, secret: 'Dashboard-Sedes-Temporal-2026-256-bits' });
  t.after(() => backend.close());
  const api = request(backend.app);
  const password = 'Prueba-Dashboard-Sedes!';
  const passwordHash = await hashPassword(password);
  const alta = (rut, rol) => datos.crearUsuario({ rut, rol, nombre: rol, activo: true, passwordHash });
  const jefatura = alta('11111111-1', 'JEFATURA');
  const supervisor = alta('22222222-2', 'SUPERVISOR');
  const tecnico = alta('33333333-3', 'TECNICO');
  const particular = datos.crearTenant('Otra empresa', 'PARTICULAR', ahora);
  datos.enTenant(particular.id, () => alta('44444444-4', 'JEFATURA'));
  async function entrar(rut) {
    const { body } = await api.post('/auth/login').send({ rut, password }).expect(200);
    return { Authorization: 'Bearer ' + body.token };
  }
  const admin = await entrar(jefatura.rut);
  const delegado = await entrar(supervisor.rut);
  const fuera = await entrar('44444444-4');
  const norte = (await api.post('/sedes').set(admin).send({ nombre: 'Norte', direccion: 'Planta Norte 110' }).expect(201)).body;
  const sur = (await api.post('/sedes').set(admin).send({ nombre: 'Sur', direccion: 'Planta Sur 220' }).expect(201)).body;
  const fallas = new Fallas(datos);
  const ordenes = new OrdenesTrabajo(datos, new InventarioRepuestos(datos));
  for (const { sede, codigo, cantidad } of [
    { sede: norte, codigo: 'EQ-0001', cantidad: 2 },
    { sede: sur, codigo: 'EQ-0002', cantidad: 3 },
  ]) {
    const activo = datos.crear({ codigo, nombre: 'Bomba ' + sede.nombre, ubicacion: sede.nombre,
      criticidad: 'ALTA', sede_id: sede.id }, jefatura.id, ahora);
    for (let i = 0; i < cantidad; i++) {
      const falla = fallas.crear({ equipo_id: activo.id, descripcion: 'Falla recurrente ' + i }, jefatura.id, ahora);
      ordenes.crear({ falla_id: falla.id, tecnico_id: tecnico.id, fecha_limite: '2026-11-30' }, jefatura.id, ahora);
    }
  }

  const global = (await api.get('/dashboard/metricas').set(admin).expect(200)).body;
  assert(esquema('dashboard', 'MetricasDashboard')(global));
  assert.equal(global.ordenes_abiertas, 5);
  assert.deepEqual(global.por_sede.map(({ nombre, metricas }) => [nombre, metricas.ordenes_abiertas]), [['Norte', 2], ['Sur', 3]]);
  const filtrado = (await api.get('/dashboard/metricas').query({ sede_id: norte.id }).set(admin).expect(200)).body;
  assert.equal(filtrado.ordenes_abiertas, 2);
  assert.deepEqual(filtrado.fallas_recurrentes.map(falla => falla.equipo_codigo), ['EQ-0001']);
  assert.equal(filtrado.por_sede, undefined);

  await api.patch(`/usuarios/${supervisor.id}/sede`).set(admin).send({ sede_id: norte.id }).expect(200);
  const limitado = (await api.get('/dashboard/metricas').set(delegado).expect(200)).body;
  assert.deepEqual(limitado, filtrado);
  await api.get('/dashboard/metricas').query({ sede_id: sur.id }).set(delegado).expect(404);
  for (const query of [{}, { sede_id: norte.id }]) {
    const bloqueado = await api.get('/dashboard/metricas').query(query).set(fuera).expect(403);
    assert.equal(bloqueado.body.codigo, 'PLAN_EMPRESA_REQUERIDO');
  }
});
