import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const base = Date.parse('2026-11-20T13:00:00Z');
const instante = minutos => base + minutos * 60_000;
const iso = minutos => new Date(instante(minutos)).toISOString();
const clave = 'Andina-Pruebas-Historial';
const hash = hashPassword(clave);
const cierre = { diagnostico: 'Sello desgastado', solucion: 'Se cambió el sello', duracion_minutos: 25 };

async function preparar(t) {
  const datos = new Datos();
  const usuarios = {};
  const tokens = {};
  const personas = [
    ['supervisor', '11111111-1', 'SUPERVISOR'],
    ['tecnico', '22222222-2', 'TECNICO'],
    ['lector', '33333333-3', 'TECNICO'],
    ['trabajador', '44444444-4', 'TRABAJADOR'],
    ['bodega', '55555555-5', 'BODEGA'],
    ['jefatura', '66666666-6', 'JEFATURA'],
  ];
  for (const [nombre, rut, rol] of personas) {
    usuarios[nombre] = datos.crearUsuario({ nombre, rut, rol, activo: true, passwordHash: await hash });
  }
  const equipos = ['EQ-4001', 'EQ-4002'].map(codigo => datos.crear(
    { codigo, nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA' }, usuarios.supervisor.id, base,
  ));
  let ahora = base;
  const backend = await crearAplicacion({ secret: 'secreto-sintetico-historial-pruebas', datos, now: () => ahora });
  t.after(() => backend.close());
  const api = request(backend.app);

  async function token(persona) {
    if (!tokens[persona]) {
      const { body } = await api.post('/auth/login').send({ rut: usuarios[persona].rut, password: clave }).expect(200);
      tokens[persona] = 'Bearer ' + body.token;
    }
    return tokens[persona];
  }

  function fecha(minutos) {
    ahora = instante(minutos);
  }

  async function falla(minutos, descripcion, equipo = equipos[0]) {
    fecha(minutos);
    const { body } = await api.post('/fallas').set('Authorization', await token('trabajador'))
      .send({ equipo_id: equipo.id, descripcion }).expect(201);
    return body.id;
  }

  return { api, datos, equipos, usuarios, token, fecha, falla };
}

test('El historial exige rol autorizado, equipo vigente y paginación válida', async t => {
  const f = await preparar(t);
  const url = '/equipos/' + f.equipos[0].id + '/historial';
  await f.api.get(url).expect(401);
  for (const rol of ['trabajador', 'bodega']) {
    const res = await f.api.get(url).set('Authorization', await f.token(rol)).expect(403);
    assert.equal(res.body.codigo, 'SIN_PERMISO');
  }
  for (const rol of ['lector', 'supervisor', 'jefatura']) {
    const res = await f.api.get(url).set('Authorization', await f.token(rol)).expect(200);
    assert.deepEqual(res.body, { items: [], total: 0, page: 1, size: 20 });
  }
  const lector = await f.token('lector');
  const supervisor = await f.token('supervisor');
  for (const parametros of ['?page=0', '?size=101', '?page=1&page=2', '?sin_orden=true']) {
    await f.api.get(url + parametros).set('Authorization', lector).expect(400);
  }
  await f.api.get('/equipos/no-valido/historial').set('Authorization', lector).expect(400);
  await f.api.get('/equipos/999/historial').set('Authorization', lector).expect(404);
  await f.api.delete('/activos/' + f.equipos[0].id).set('Authorization', supervisor).expect(204);
  const inexistente = await f.api.get(url).set('Authorization', lector).expect(404);
  assert.equal(inexistente.body.codigo, 'ACTIVO_NO_ENCONTRADO');
});

test('El historial agrupa por falla, prioriza actividad reciente y conserva repuestos históricos', async t => {
  const f = await preparar(t);
  const supervisor = await f.token('supervisor');
  const tecnico = await f.token('tecnico');
  const lector = await f.token('lector');
  const jefatura = await f.token('jefatura');
  const url = '/equipos/' + f.equipos[0].id + '/historial';
  const antigua = await f.falla(0, 'Se detectó una fuga.');
  const nueva1 = await f.falla(1, 'Se oyó una vibración.');
  const nueva2 = await f.falla(1, 'Hay residuos en el piso.');

  f.fecha(2);
  const { body: orden } = await f.api.post('/ordenes').set('Authorization', supervisor)
    .send({ falla_id: antigua, tecnico_id: f.usuarios.tecnico.id, fecha_limite: '2026-11-23' }).expect(201);
  f.fecha(3);
  await f.api.patch('/ordenes/' + orden.id + '/estado').set('Authorization', tecnico)
    .send({ estado: 'EN_PROGRESO' }).expect(200);

  const { body: repuesto } = await f.api.post('/repuestos').set('Authorization', jefatura)
    .send({ codigo: 'SELLO-1', nombre: 'Sello original', stock_minimo: 1 }).expect(201);
  const rutaRepuesto = '/repuestos/' + repuesto.id;
  await f.api.post(rutaRepuesto + '/movimientos').set('Authorization', jefatura)
    .send({ tipo: 'ENTRADA', cantidad: 1 }).expect(201);
  f.fecha(4);
  await f.api.put('/ordenes/' + orden.id + '/cierre').set('Authorization', tecnico)
    .send({ ...cierre, repuestos_consumidos: [{ repuesto_id: repuesto.id, cantidad: 1 }] }).expect(200);
  f.fecha(5);
  await f.api.put(rutaRepuesto).set('Authorization', jefatura)
    .send({ nombre: 'Sello renombrado', stock_minimo: 2 }).expect(200);
  await f.api.delete(rutaRepuesto).set('Authorization', jefatura).expect(204);
  await f.falla(6, 'Registro de otro equipo.', f.equipos[1]);

  const primera = await f.api.get(url + '?size=1').set('Authorization', lector).expect(200);
  assert(esquema('activos', 'HistorialEquipo')(primera.body));
  assert.deepEqual(primera.body, {
    total: 3, page: 1, size: 1, items: [{
      actividad_en: iso(4),
      falla: { id: antigua, descripcion: 'Se detectó una fuga.', prioridad: 'ALTA', fecha_reporte: iso(0) },
      orden: { id: orden.id, estado: 'CERRADA', fecha_limite: '2026-11-23', creada_en: iso(2), iniciada_en: iso(3), cerrada_en: iso(4) },
      intervencion: { ...cierre, registrada_en: iso(4), repuestos_usados: null, repuestos_consumidos: [
        { repuesto_id: repuesto.id, codigo: 'SELLO-1', nombre: 'Sello original', cantidad: 1 },
      ] },
    }],
  });

  const segunda = await f.api.get(url + '?size=1&page=2').set('Authorization', lector).expect(200);
  const tercera = await f.api.get(url + '?size=1&page=3').set('Authorization', lector).expect(200);
  assert.equal(segunda.body.items[0].falla.id, nueva2);
  assert.equal(tercera.body.items[0].falla.id, nueva1);
  assert.equal(tercera.body.items[0].orden, null);
  assert.equal(tercera.body.items[0].intervencion, null);
  const fueraDePagina = await f.api.get(url + '?size=1&page=4').set('Authorization', lector).expect(200);
  assert.deepEqual(fueraDePagina.body, { items: [], total: 3, page: 4, size: 1 });
});

test('Los cierres históricos y sus fechas proceden de los registros existentes', async t => {
  const f = await preparar(t);
  const legacy = await f.falla(0, 'Falla cerrada en la versión anterior.');
  const sinAuditoria = await f.falla(1, 'Falla con intervención histórica sin auditoría.');
  const tecnicoId = f.usuarios.tecnico.id;
  const agregarOrden = f.datos.db.prepare(
    "INSERT INTO ordenes_trabajo(falla_id, tecnico_id, fecha_limite, estado) VALUES (?, ?, '2026-11-23', ?)",
  );
  const cerrada = Number(agregarOrden.run(legacy, tecnicoId, 'CERRADA').lastInsertRowid);
  const conIntervencion = Number(agregarOrden.run(sinAuditoria, tecnicoId, 'EN_PROGRESO').lastInsertRowid);
  f.datos.auditar(tecnicoId, 'ORDEN_ESTADO_CERRADA', cerrada, instante(5));
  f.datos.auditar(tecnicoId, 'ACTIVO_MODIFICADO', conIntervencion, instante(10));
  f.datos.db.prepare(
    'INSERT INTO intervenciones(orden_id, autor_id, diagnostico, solucion, duracion_minutos, repuestos_usados, registrada_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(conIntervencion, tecnicoId, cierre.diagnostico, cierre.solucion, cierre.duracion_minutos, 'Sello en texto', iso(6));
  f.datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'CERRADA' WHERE id = ?").run(conIntervencion);

  const res = await f.api.get('/equipos/' + f.equipos[0].id + '/historial')
    .set('Authorization', await f.token('lector')).expect(200);
  assert(esquema('activos', 'HistorialEquipo')(res.body));
  const [intervenida, soloCierre] = res.body.items;
  assert.equal(intervenida.falla.id, sinAuditoria);
  assert.equal(intervenida.actividad_en, iso(6));
  assert.deepEqual(intervenida.orden, {
    id: conIntervencion, estado: 'CERRADA', fecha_limite: '2026-11-23',
    creada_en: null, iniciada_en: null, cerrada_en: null,
  });
  assert.equal(intervenida.intervencion.repuestos_usados, 'Sello en texto');
  assert.deepEqual(intervenida.intervencion.repuestos_consumidos, []);
  assert.equal(soloCierre.falla.id, legacy);
  assert.equal(soloCierre.actividad_en, iso(5));
  assert.equal(soloCierre.orden.cerrada_en, iso(5));
  assert.equal(soloCierre.intervencion, null);
});
