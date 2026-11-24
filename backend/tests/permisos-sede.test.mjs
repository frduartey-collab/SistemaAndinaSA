import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { Sedes } from '../dist/sedes.js';
import { hashPassword } from '../dist/seguridad.js';

const clave = 'Sedes-Prueba-Sigem!';
const hash = hashPassword(clave);
const ahora = Date.parse('2026-11-23T15:00:00Z');
const ficha = codigo => ({ codigo, nombre: 'Bomba ' + codigo, ubicacion: 'Planta', criticidad: 'ALTA' });

async function configurar(t) {
  const datos = new Datos();
  const backend = await crearAplicacion({ secret: 'secreto-sintetico-permisos-sedes-2026', datos, now: () => ahora });
  t.after(() => backend.close());
  const api = request(backend.app), usuarios = {}, tokens = {};
  const passwordHash = await hash;
  for (const [nombre, rut, rol] of [
    ['jefa', '11111111-1', 'JEFATURA'], ['supA', '22222222-2', 'SUPERVISOR'],
    ['supB', '33333333-3', 'SUPERVISOR'], ['tecA', '44444444-4', 'TECNICO'],
    ['tecB', '55555555-5', 'TECNICO'], ['general', '66666666-6', 'TECNICO'],
  ]) usuarios[nombre] = datos.crearUsuario({ rut, nombre, rol, activo: true, passwordHash });
  const sedes = new Sedes(datos);
  const a = sedes.crear({ nombre: 'Norte', direccion: 'Norte 100' }, usuarios.jefa.id, ahora);
  const b = sedes.crear({ nombre: 'Sur', direccion: 'Sur 200' }, usuarios.jefa.id, ahora);
  for (const persona of ['supA', 'tecA']) datos.asignarSedeUsuario(usuarios[persona].id, a.id, usuarios.jefa.id, ahora);
  for (const persona of ['supB', 'tecB']) datos.asignarSedeUsuario(usuarios[persona].id, b.id, usuarios.jefa.id, ahora);
  const equipoA = datos.crear({ ...ficha('EQ-7010'), sede_id: a.id }, usuarios.jefa.id, ahora);
  const equipoB = datos.crear({ ...ficha('EQ-7020'), sede_id: b.id }, usuarios.jefa.id, ahora);
  const sinSede = datos.crear(ficha('EQ-7030'), usuarios.jefa.id, ahora);
  const ajena = datos.crearTenant('Ajena', 'EMPRESA', ahora);
  const jefaAjena = datos.enTenant(ajena.id, () => datos.crearUsuario({
    rut: '77777777-7', nombre: 'Ajena', rol: 'JEFATURA', activo: true, passwordHash,
  }));
  const sedeAjena = datos.enTenant(ajena.id, () => sedes.crear({ nombre: 'Ajena', direccion: 'Otra 1' }, jefaAjena.id, ahora));
  async function auth(nombre) {
    if (!tokens[nombre]) {
      const { body } = await api.post('/auth/login').send({ rut: usuarios[nombre].rut, password: clave }).expect(200);
      tokens[nombre] = 'Bearer ' + body.token;
    }
    return tokens[nombre];
  }
  return { datos, backend, api, usuarios, a, b, equipoA, equipoB, sinSede, jefaAjena, sedeAjena, auth };
}

test('B4: asignación de usuarios por Jefatura, integridad y actualización de sesión inmediata', async t => {
  const f = await configurar(t), jefa = await f.auth('jefa'), supervisor = await f.auth('supA');
  await f.api.get('/usuarios').expect(401);
  await f.api.get('/usuarios').set('Authorization', supervisor).expect(403);
  const { body: cuentas } = await f.api.get('/usuarios').set('Authorization', jefa).expect(200);
  assert.equal(cuentas.length, 6);
  assert.equal(cuentas.find(u => u.id === f.usuarios.jefa.id).sede_id, null);
  const asignar = (id, sede_id, token = jefa) => f.api.patch('/usuarios/' + id + '/sede').set('Authorization', token).send({ sede_id });
  await asignar(f.usuarios.tecA.id, f.b.id, supervisor).expect(403);
  await asignar(f.usuarios.jefa.id, f.a.id).expect(403);
  await asignar(f.jefaAjena.id, f.a.id).expect(404);
  await asignar(f.usuarios.tecA.id, f.sedeAjena.id).expect(404);
  assert.throws(() => f.datos.db.prepare('UPDATE usuarios SET sede_id=? WHERE id=?').run(f.sedeAjena.id, f.usuarios.tecA.id), /sede/);
  assert.throws(() => f.datos.db.prepare('UPDATE usuarios SET sede_id=? WHERE id=?').run(f.a.id, f.usuarios.jefa.id), /Jefatura/);
  await f.api.delete('/sedes/' + f.a.id).set('Authorization', jefa).expect(409);
  await asignar(f.usuarios.supA.id, f.b.id).expect(200);
  const { body: perfil } = await f.api.get('/auth/me').set('Authorization', supervisor).expect(200);
  assert.equal(perfil.sede_id, f.b.id);
  const { body: visibles } = await f.api.get('/activos').set('Authorization', supervisor).expect(200);
  assert.deepEqual(visibles.items.map(item => item.id), [f.equipoB.id]);
  await asignar(f.usuarios.supA.id, null).expect(200);
  assert.equal((await f.api.get('/activos').set('Authorization', supervisor).expect(200)).body.total, 3);
  assert.deepEqual(f.datos.db.pragma('foreign_key_check'), []);
});

test('B4: activos heredan sede, niegan escapes y mantienen scope al bajar de plan', async t => {
  const f = await configurar(t), token = await f.auth('supA'), jefa = await f.auth('jefa');
  const { body } = await f.api.get('/activos').set('Authorization', token).set('X-Sede-Id', String(f.b.id)).expect(200);
  assert.equal(body.total, 1);
  assert.deepEqual(body.items.map(item => item.id), [f.equipoA.id]);
  await f.api.get('/activos/' + f.equipoB.id).set('Authorization', token).expect(404);
  await f.api.patch('/activos/' + f.equipoB.id).set('Authorization', token).send({ nombre: 'Ajeno' }).expect(404);
  await f.api.delete('/activos/' + f.equipoB.id).set('Authorization', token).expect(404);
  const { body: creado } = await f.api.post('/activos').set('Authorization', token).send(ficha('EQ-7040')).expect(201);
  assert.equal(creado.sede_id, f.a.id);
  await f.api.post('/activos').set('Authorization', token).send({ ...ficha('EQ-7050'), sede_id: null }).expect(404);
  await f.api.post('/activos').set('Authorization', token).send({ ...ficha('EQ-7050'), sede_id: f.b.id }).expect(404);
  await f.api.patch('/activos/' + creado.id).set('Authorization', token).send({ sede_id: null }).expect(404);
  await f.api.patch('/activos/' + creado.id).set('Authorization', token).send({ sede_id: f.b.id }).expect(404);
  assert.equal((await f.api.get('/activos').set('Authorization', jefa).expect(200)).body.total, 4);
  assert.deepEqual((await f.api.get('/sedes').set('Authorization', token).expect(200)).body.map(s => s.id), [f.a.id]);
  await f.api.post('/sedes').set('Authorization', token).send({ nombre: 'Escape', direccion: 'Nueva' }).expect(403);
  f.datos.db.prepare("UPDATE tenants SET plan='PARTICULAR' WHERE id=1").run();
  const despues = await f.api.post('/activos').set('Authorization', token).send(ficha('EQ-7050')).expect(201);
  assert.equal(despues.body.sede_id, f.a.id);
  assert.equal((await f.api.get('/activos').set('Authorization', token).expect(200)).body.total, 3);
});

test('B4: fallas, fotos y avisos no atraviesan sedes, ni con acceso directo', async t => {
  const f = await configurar(t), jefe = await f.auth('jefa'), norte = await f.auth('supA'), sur = await f.auth('supB');
  const reportar = equipo_id => f.api.post('/fallas').set('Authorization', jefe).send({
    equipo_id, descripcion: 'Fuga', fotos: [{ nombre: 'foto.png', tipo: 'image/png', contenido_base64: 'iVBORw0KGgo=' }],
  }).expect(201);
  const fa = (await reportar(f.equipoA.id)).body, fb = (await reportar(f.equipoB.id)).body;
  const detalle = (await f.api.get('/fallas/' + fb.id).set('Authorization', jefe).expect(200)).body;
  await f.api.get('/fallas/' + fb.id).set('Authorization', norte).expect(404);
  await f.api.get('/fallas/' + fb.id + '/fotos/' + detalle.fotos[0].id).set('Authorization', norte).expect(404);
  await f.api.post('/fallas').set('Authorization', norte).send({ equipo_id: f.equipoB.id, descripcion: 'Ajena' }).expect(404);
  assert.deepEqual((await f.api.get('/fallas').set('Authorization', norte).expect(200)).body.items.map(x => x.id), [fa.id]);
  const avisosNorte = (await f.api.get('/notificaciones').set('Authorization', norte).expect(200)).body;
  const avisosSur = (await f.api.get('/notificaciones').set('Authorization', sur).expect(200)).body;
  assert.deepEqual(avisosNorte.items.map(x => x.falla_id), [fa.id]);
  assert.deepEqual(avisosSur.items.map(x => x.falla_id), [fb.id]);
  assert.equal((await f.api.get('/notificaciones').set('Authorization', jefe).expect(200)).body.total, 2);
  await f.api.patch('/notificaciones/' + avisosSur.items[0].id + '/leida').set('Authorization', norte).expect(404);
  await f.api.patch('/usuarios/' + f.usuarios.supA.id + '/sede').set('Authorization', jefe).send({ sede_id: f.b.id }).expect(200);
  assert.equal((await f.api.get('/notificaciones').set('Authorization', norte).expect(200)).body.total, 0);
  await f.api.patch('/notificaciones/' + avisosNorte.items[0].id + '/leida').set('Authorization', norte).expect(404);
});

test('B4: órdenes e historial respetan sede; técnico global puede trabajar en ambas', async t => {
  const f = await configurar(t), jefe = await f.auth('jefa'), norte = await f.auth('supA'), tecnico = await f.auth('tecA');
  const falla = async equipo_id => (await f.api.post('/fallas').set('Authorization', jefe).send({ equipo_id, descripcion: 'Falla' }).expect(201)).body;
  const fa = await falla(f.equipoA.id), fb = await falla(f.equipoB.id);
  const crear = (falla_id, tecnico_id) => f.api.post('/ordenes').set('Authorization', jefe).send({ falla_id, tecnico_id, fecha_limite: '2099-12-31' });
  const oa = (await crear(fa.id, f.usuarios.tecA.id).expect(201)).body;
  await crear(fb.id, f.usuarios.tecA.id).expect(409);
  const ob = (await crear(fb.id, f.usuarios.general.id).expect(201)).body;
  const lista = (await f.api.get('/ordenes').set('Authorization', norte).expect(200)).body;
  assert.equal(lista.total, 1);
  assert.deepEqual(lista.items.map(o => o.id), [oa.id]);
  await f.api.get('/ordenes/' + ob.id).set('Authorization', norte).expect(404);
  await f.api.patch('/ordenes/' + ob.id + '/estado').set('Authorization', norte).send({ estado: 'EN_PROGRESO' }).expect(404);
  await f.api.get('/equipos/' + f.equipoB.id + '/historial').set('Authorization', norte).expect(404);
  assert.equal((await f.api.get('/equipos/' + f.equipoA.id + '/historial').set('Authorization', norte).expect(200)).body.total, 1);
  const tecnicos = (await f.api.get('/ordenes/tecnicos').set('Authorization', norte).expect(200)).body.items.map(u => u.id);
  assert(tecnicos.includes(f.usuarios.tecA.id) && tecnicos.includes(f.usuarios.general.id));
  assert(!tecnicos.includes(f.usuarios.tecB.id));
  await f.api.get('/ordenes/' + oa.id).set('Authorization', tecnico).expect(200);
  await f.api.patch('/usuarios/' + f.usuarios.tecA.id + '/sede').set('Authorization', jefe).send({ sede_id: f.b.id }).expect(409);
  await f.api.patch('/activos/' + f.equipoA.id).set('Authorization', jefe).send({ sede_id: f.b.id }).expect(409);
  const global = await f.auth('general');
  await f.api.patch('/ordenes/' + ob.id + '/estado').set('Authorization', global).send({ estado: 'EN_PROGRESO' }).expect(200);
  await f.api.put('/ordenes/' + ob.id + '/cierre').set('Authorization', global)
    .send({ diagnostico: 'Fuga', solucion: 'Ajuste', duracion_minutos: 10 }).expect(200);
  await f.api.patch('/ordenes/' + oa.id + '/estado').set('Authorization', tecnico).send({ estado: 'EN_PROGRESO' }).expect(200);
  await f.api.put('/ordenes/' + oa.id + '/cierre').set('Authorization', tecnico)
    .send({ diagnostico: 'Fuga', solucion: 'Ajuste', duracion_minutos: 10 }).expect(200);
  await f.api.patch('/usuarios/' + f.usuarios.tecA.id + '/sede').set('Authorization', jefe).send({ sede_id: f.b.id }).expect(200);
  await f.api.get('/ordenes/' + oa.id).set('Authorization', tecnico).expect(404);
});

test('B4: preventivos limitan sede en lectura/evaluación y el scheduler conserva alcance global', async t => {
  const f = await configurar(t), jefe = await f.auth('jefa'), norte = await f.auth('supA');
  const crear = equipo_id => f.api.post('/preventivos').set('Authorization', jefe).send({
    equipo_id, tecnico_id: f.usuarios.general.id, descripcion: 'Revisión', tipo_disparador: 'FECHA',
    intervalo_dias: 5, proxima_fecha: '2026-11-20',
  }).expect(201);
  const pa = (await crear(f.equipoA.id)).body, pb = (await crear(f.equipoB.id)).body;
  assert.deepEqual((await f.api.get('/preventivos').set('Authorization', norte).expect(200)).body.map(p => p.id), [pa.id]);
  await f.api.patch('/preventivos/' + pb.id).set('Authorization', norte).send({ activo: false }).expect(404);
  const evaluacion = (await f.api.post('/preventivos/evaluar').set('Authorization', norte).expect(200)).body;
  assert.equal(evaluacion.generadas, 1);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM ordenes_trabajo WHERE equipo_id=?').get(f.equipoB.id).n, 0);
  f.backend.evaluarPreventivosProgramados((id, error) => { throw new Error(String(id), { cause: error }); });
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM ordenes_trabajo WHERE equipo_id=?').get(f.equipoB.id).n, 1);
  assert.equal((await f.api.get('/ordenes').set('Authorization', norte).expect(200)).body.total, 1);
});
