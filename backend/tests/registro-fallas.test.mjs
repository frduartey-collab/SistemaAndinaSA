import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const password = 'AndinaPruebaHU03!';
const hash = hashPassword(password);
const registro = { rut: '66666666-6', nombre: 'Nueva cuenta', password, rol: 'TRABAJADOR' };

async function fixture(t) {
  const datos = new Datos();
  const usuarios = {};
  for (const [rut, rol] of [
    ['11111111-1', 'SUPERVISOR'],
    ['22222222-2', 'TECNICO'],
    ['33333333-3', 'TRABAJADOR'],
    ['44444444-4', 'BODEGA'],
    ['55555555-5', 'JEFATURA'],
  ]) {
    usuarios[rol] = datos.crearUsuario({ rut, nombre: rol, passwordHash: await hash, rol, activo: true });
  }
  const equipo = datos.crear({
    codigo: 'EQ-0110', nombre: 'Bomba', ubicacion: 'Nave A', criticidad: 'ALTA',
  }, usuarios.SUPERVISOR.id, Date.now());
  const backend = await crearAplicacion({ secret: 'secreto-sintetico-para-pruebas-de-HU-03', datos });
  t.after(() => backend.close());
  const api = request(backend.app);

  async function sesion(rol) {
    const respuesta = await api.post('/auth/login').send({ rut: usuarios[rol].rut, password }).expect(200);
    return 'Bearer ' + respuesta.body.token;
  }

  return { api, datos, equipo, usuarios, sesion };
}

test('Registro público crea una cuenta utilizable y guarda solo el hash', async (t) => {
  const f = await fixture(t);
  const res = await f.api.post('/auth/register').send(registro).expect(201);
  assert(esquema('auth', 'UsuarioSesion')(res.body));
  assert.equal(res.body.rol, 'TRABAJADOR');
  assert.equal(res.body.activo, true);
  assert.match(f.datos.usuarioPorRut(registro.rut).passwordHash, /^\$2[aby]\$/);
  const duplicado = await f.api.post('/auth/register').send(registro).expect(409);
  assert.equal(duplicado.body.codigo, 'RUT_DUPLICADO');
  await f.api.post('/auth/login').send({ rut: registro.rut, password }).expect(200);

  const invalido = await f.api.post('/auth/register').send({ ...registro, rut: '77777777-1' }).expect(400);
  assert.equal(invalido.body.codigo, 'RUT_INVALIDO');
  await f.api.post('/auth/register').send({ ...registro, rut: '77777777-7', password: '🙂'.repeat(20) }).expect(400);
});

test('Registro exige autorización para roles reservados y evita altas simultáneas del mismo RUT', async (t) => {
  const f = await fixture(t);
  await f.api.post('/auth/register').send({ ...registro, rol: 'SUPERVISOR' }).expect(403);
  await f.api.post('/auth/register').send({ ...registro, rol: 'BODEGA' }).expect(403);
  await f.api.post('/auth/register').set('Authorization', 'Bearer invalido').send(registro).expect(401);
  await f.api.post('/auth/register').set('Authorization', await f.sesion('TECNICO'))
    .send({ ...registro, rol: 'JEFATURA' }).expect(403);
  await f.api.post('/auth/register').set('Authorization', await f.sesion('SUPERVISOR'))
    .send({ ...registro, rol: 'BODEGA' }).expect(201);
  await f.api.post('/auth/register').set('Authorization', await f.sesion('JEFATURA'))
    .send({ ...registro, rut: '77777777-7', rol: 'SUPERVISOR' }).expect(201);

  const paralelo = { ...registro, rut: '88888888-8' };
  const respuestas = await Promise.all([0, 1].map(() => f.api.post('/auth/register').send(paralelo)));
  assert.deepEqual(respuestas.map((res) => res.status).sort(), [201, 409]);
});

test('Fallas vincula el reporte al equipo y al autor, sugiere prioridad y conserva reportes tras baja', async (t) => {
  const f = await fixture(t);
  const tecnico = await f.sesion('TECNICO');
  const datos = { equipo_id: f.equipo.id, descripcion: '  Bomba vibra desde el arranque.  ' };
  const reporte = await f.api.post('/fallas').set('Authorization', tecnico).send(datos).expect(201);
  assert(esquema('fallas', 'FallaRespuesta')(reporte.body));
  assert.equal(reporte.body.usuario_id, f.usuarios.TECNICO.id);
  assert.equal(reporte.body.equipo_codigo, 'EQ-0110');
  assert.equal(reporte.body.descripcion, 'Bomba vibra desde el arranque.');
  assert.equal(reporte.body.prioridad, 'ALTA');
  assert.equal(reporte.body.estado, 'REPORTADA');
  const prioritaria = await f.api.post('/fallas').set('Authorization', tecnico)
    .send({ ...datos, prioridad: 'BAJA' }).expect(201);
  assert.equal(prioritaria.body.prioridad, 'BAJA');

  await f.api.post('/fallas').set('Authorization', tecnico).send({ ...datos, usuario_id: 1 }).expect(400);
  await f.api.post('/fallas').set('Authorization', tecnico).send({ ...datos, descripcion: '   ' }).expect(400);
  await f.api.post('/fallas').set('Authorization', tecnico).send({ ...datos, prioridad: 'URGENTE' }).expect(400);
  await f.api.delete('/activos/' + f.equipo.id).set('Authorization', await f.sesion('SUPERVISOR')).expect(204);
  await f.api.post('/fallas').set('Authorization', tecnico).send(datos).expect(404);
  const historico = await f.api.get('/fallas').set('Authorization', tecnico).expect(200);
  assert(esquema('fallas', 'PaginaFallas')(historico.body));
  assert.deepEqual(historico.body.items.map(({ id }) => id), [prioritaria.body.id, reporte.body.id]);
});

test('Fallas aplica permisos y paginación tanto a los datos como al total', async (t) => {
  const f = await fixture(t);
  const datos = { equipo_id: f.equipo.id, descripcion: 'Vibración en la carcasa.' };
  await f.api.get('/fallas').expect(401);
  await f.api.post('/fallas').send(datos).expect(401);
  const bodega = await f.sesion('BODEGA');
  await f.api.get('/fallas').set('Authorization', bodega).expect(403);
  await f.api.post('/fallas').set('Authorization', bodega).send(datos).expect(403);

  const tecnico = await f.sesion('TECNICO');
  const trabajador = await f.sesion('TRABAJADOR');
  const primero = await f.api.post('/fallas').set('Authorization', tecnico).send(datos).expect(201);
  const segundo = await f.api.post('/fallas').set('Authorization', trabajador).send(datos).expect(201);
  for (const [token, id] of [[tecnico, primero.body.id], [trabajador, segundo.body.id]]) {
    const propios = await f.api.get('/fallas?size=1').set('Authorization', token).expect(200);
    assert.equal(propios.body.total, 1);
    assert.deepEqual(propios.body.items.map((item) => item.id), [id]);
  }
  for (const rol of ['SUPERVISOR', 'JEFATURA']) {
    const admin = await f.sesion(rol);
    const paginada = await f.api.get('/fallas?page=2&size=1').set('Authorization', admin).expect(200);
    assert.equal(paginada.body.total, 2);
    assert.deepEqual(paginada.body.items.map(({ id }) => id), [primero.body.id]);
    await f.api.get('/fallas?page=0').set('Authorization', admin).expect(400);
  }
});
