import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { IntegracionesERP } from '../dist/integraciones-erp.js';
import { OrdenesTrabajo } from '../dist/ordenes.js';
import { InventarioRepuestos } from '../dist/repuestos.js';
import { hashPassword } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';

const AHORA = Date.parse('2026-11-23T15:00:00Z');
const clave = 'Andina-ERP-Prueba';
const hash = hashPassword(clave);
const config = '/integraciones/erp';
const costos = '/api/v1/erp/costos-repuestos';
const stock = '/api/v1/erp/sync-stock';

async function preparar(t) {
  const datos = new Datos();
  const otra = datos.crearTenant('Otra empresa', 'EMPRESA', AHORA);
  const particular = datos.crearTenant('Taller', 'PARTICULAR', AHORA);
  const passwordHash = await hash;
  const usuarios = {};
  for (const [nombre, rut, rol, tenant] of [
    ['jefe', '11111111-1', 'JEFATURA', 1],
    ['supervisor', '22222222-2', 'SUPERVISOR', 1],
    ['ajeno', '33333333-3', 'JEFATURA', otra.id],
    ['particular', '44444444-4', 'JEFATURA', particular.id],
  ]) {
    usuarios[nombre] = datos.enTenant(tenant, () => datos.crearUsuario({ rut, nombre, rol, activo: true, passwordHash }));
  }
  const app = await crearAplicacion({ secret: 'secreto-sintetico-ERP-pruebas-backend', datos, now: () => AHORA });
  t.after(() => app.close());
  const api = request(app.app);
  async function token(persona) {
    return 'Bearer ' + (await api.post('/auth/login').send({ rut: usuarios[persona].rut, password: clave }).expect(200)).body.token;
  }
  async function habilitar(tokenSesion) {
    const { body } = await api.post(config + '/clave').set('Authorization', tokenSesion).expect(201);
    await api.put(config).set('Authorization', tokenSesion).send({ webhook_url: null, activo: true }).expect(200);
    return body.api_key;
  }
  async function crearRepuesto(tokenSesion, codigo, costo) {
    const entrada = { codigo, nombre: codigo, stock_minimo: 0 };
    if (costo !== undefined) entrada.costo_unitario_clp = costo;
    return (await api.post('/repuestos').set('Authorization', tokenSesion).send(entrada).expect(201)).body;
  }
  return { api, datos, otra, usuarios, token, habilitar, crearRepuesto };
}

test('Configuración exige Jefatura Empresa, guarda solo hash y la rotación revoca la clave anterior', async t => {
  const f = await preparar(t);
  const jefe = await f.token('jefe');
  const supervisor = await f.token('supervisor');
  const particular = await f.token('particular');
  const cambiar = (webhook_url, activo) => f.api.put(config).set('Authorization', jefe).send({ webhook_url, activo });
  await f.api.get(config).expect(401);
  await f.api.get(config).set('Authorization', supervisor).expect(403);
  const { body } = await f.api.get(config).set('Authorization', jefe).expect(200);
  assert.deepEqual(body, { webhook_url: null, activo: false, clave_configurada: false });
  await f.api.post(config + '/clave').set('Authorization', particular).expect(403);
  await cambiar(null, true).expect(409);
  for (const url of ['http://erp.test', 'https://usuario:clave@erp.test/', 'https://erp.test/?token=prueba', 'https://erp.test/#fragmento']) {
    await cambiar(url, false).expect(400);
  }

  const generar = () => f.api.post(config + '/clave').set('Authorization', jefe).expect(201);
  const { body: inicial } = await generar();
  assert(esquema('erp', 'ClaveERP')(inicial));
  const fila = f.datos.db.prepare('SELECT api_key_hash FROM integraciones_erp WHERE tenant_id = 1').get();
  assert.equal(fila.api_key_hash, createHash('sha256').update(inicial.api_key).digest('hex'));
  await f.api.get(costos).set('X-API-Key', inicial.api_key).expect(403);
  const url = 'https://erp.test:8443/api/recibir';
  await cambiar(url, true).expect(200);
  await f.api.get(costos).set('Authorization', jefe).expect(401);
  await f.api.get(costos).set('X-API-Key', inicial.api_key).expect(200);
  const { body: rotada } = await generar();
  assert.notEqual(rotada.api_key, inicial.api_key);
  await f.api.get(costos).set('X-API-Key', inicial.api_key).expect(401);
  await f.api.get(costos).set('X-API-Key', rotada.api_key).expect(200);
  const actual = await f.api.get(config).set('Authorization', jefe).expect(200);
  assert.deepEqual(actual.body, { webhook_url: url, activo: true, clave_configurada: true });
  f.datos.db.prepare("UPDATE tenants SET plan='PARTICULAR' WHERE id=1").run();
  await f.api.get(costos).set('X-API-Key', rotada.api_key).expect(403);
});

test('Costos preserva el valor omitido, acepta null y exporta solo el catálogo vigente de la empresa', async t => {
  const f = await preparar(t);
  const jefe = await f.token('jefe');
  const ajeno = await f.token('ajeno');
  const key = await f.habilitar(jefe);
  const repuesto = await f.crearRepuesto(jefe, 'A-001', 20_000);
  await f.crearRepuesto(jefe, 'B-001');
  await f.crearRepuesto(ajeno, 'A-001', 99_999);
  const inactivo = await f.crearRepuesto(jefe, 'C-001', 100);
  await f.api.delete('/repuestos/' + inactivo.id).set('Authorization', jefe).expect(204);

  const ruta = '/repuestos/' + repuesto.id;
  const editar = entrada => f.api.put(ruta).set('Authorization', jefe).send(entrada).expect(200);
  const ficha = { nombre: 'Editado', stock_minimo: 1 };
  assert.equal((await editar(ficha)).body.costo_unitario_clp, 20_000);
  const pagina = await f.api.get(costos + '?size=1&page=1').set('X-API-Key', key).expect(200);
  assert(esquema('erp', 'PaginaCostosERP')(pagina.body));
  assert.deepEqual(pagina.body, {
    items: [{ codigo: 'A-001', nombre: 'Editado', stock_actual: 0, costo_unitario_clp: 20_000 }],
    total: 2, page: 1, size: 1,
  });
  await editar({ ...ficha, costo_unitario_clp: null });
  await f.api.post(ruta + '/movimientos').set('Authorization', jefe)
    .send({ tipo: 'ENTRADA', cantidad: Number.MAX_SAFE_INTEGER }).expect(201);
  const actualizado = await f.api.get(costos).set('X-API-Key', key).expect(200);
  assert(esquema('erp', 'PaginaCostosERP')(actualizado.body));
  assert.equal(actualizado.body.items[0].costo_unitario_clp, null);
  assert.equal(actualizado.body.items[0].stock_actual, Number.MAX_SAFE_INTEGER);
  assert.equal(actualizado.body.items[1].costo_unitario_clp, null);
});

test('El lote ERP normaliza códigos, revierte fallos y conserva un recibo y movimientos únicos', async t => {
  const f = await preparar(t);
  const jefe = await f.token('jefe');
  const ajeno = await f.token('ajeno');
  const key = await f.habilitar(jefe);
  const keyAjena = await f.habilitar(ajeno);
  const primero = await f.crearRepuesto(jefe, 'A-001');
  const segundo = await f.crearRepuesto(jefe, 'B-001');
  const deOtro = await f.crearRepuesto(ajeno, 'A-001');
  const enviar = (referencia, items, apiKey = key) => f.api.post(stock).set('X-API-Key', apiKey).send({ referencia, items });
  const lote = [{ codigo: 'a-001', stock_actual: 12 }, { codigo: 'B-001', stock_actual: 4 }];
  await enviar('Lote-1', [...lote, { codigo: 'A-001', stock_actual: 12 }]).expect(400);
  await enviar('Lote-1', [...lote, { codigo: 'ZZZ', stock_actual: 1 }]).expect(404);
  assert.equal(f.datos.db.prepare('SELECT count(*) AS n FROM movimientos_repuestos').get().n, 0);
  assert.equal(f.datos.db.prepare('SELECT stock_actual FROM repuestos WHERE id = ?').get(primero.id).stock_actual, 0);

  const [a, b] = await Promise.all([
    enviar('Lote-1', lote).expect(200),
    enviar('Lote-1', [...lote].reverse().map(item => ({ ...item, codigo: item.codigo.toUpperCase() }))).expect(200),
  ]);
  assert.deepEqual(a.body, { referencia: 'Lote-1', actualizados: 2 });
  assert.deepEqual(a.body, b.body);
  assert.equal((await enviar('Lote-1', [{ codigo: 'A-001', stock_actual: 10 }]).expect(409)).body.codigo, 'REFERENCIA_ERP_CONFLICTO');
  assert.deepEqual((await enviar('No-cambia', lote).expect(200)).body, { referencia: 'No-cambia', actualizados: 0 });
  await enviar('Salida', [{ codigo: 'B-001', stock_actual: 1 }]).expect(200);
  assert.deepEqual((await enviar('Lote-1', lote).expect(200)).body, a.body);
  await enviar('Lote-1', [{ codigo: 'A-001', stock_actual: 2 }], keyAjena).expect(200);
  assert.deepEqual(f.datos.db.prepare(
    'SELECT tenant_id, repuesto_id, usuario_id, tipo, cantidad, motivo FROM movimientos_repuestos ORDER BY id',
  ).all(), [
    { tenant_id: 1, repuesto_id: primero.id, usuario_id: f.usuarios.jefe.id, tipo: 'ENTRADA', cantidad: 12, motivo: 'Sincronización ERP: Lote-1' },
    { tenant_id: 1, repuesto_id: segundo.id, usuario_id: f.usuarios.jefe.id, tipo: 'ENTRADA', cantidad: 4, motivo: 'Sincronización ERP: Lote-1' },
    { tenant_id: 1, repuesto_id: segundo.id, usuario_id: f.usuarios.jefe.id, tipo: 'SALIDA', cantidad: 3, motivo: 'Sincronización ERP: Salida' },
    { tenant_id: f.otra.id, repuesto_id: deOtro.id, usuario_id: f.usuarios.ajeno.id, tipo: 'ENTRADA', cantidad: 2, motivo: 'Sincronización ERP: Lote-1' },
  ]);
  assert.equal(f.datos.db.prepare("SELECT count(*) AS n FROM auditoria WHERE accion LIKE 'REPUESTO_MOVIMIENTO_%'").get().n, 4);
});

test('La migración de costo preserva el catálogo anterior y puede repetirse', t => {
  const datos = new Datos();
  t.after(() => datos.close());
  new Fallas(datos);
  const inventario = new InventarioRepuestos(datos);
  new OrdenesTrabajo(datos, inventario);
  datos.migrarTenantsOperativos();
  const id = Number(datos.db.prepare(
    'INSERT INTO repuestos(codigo, nombre, stock_actual, stock_minimo) VALUES (?,?,?,?)',
  ).run('LEGADO', 'Pieza anterior', 10, 1).lastInsertRowid);

  const erp = new IntegracionesERP(datos, inventario);
  assert.deepEqual(erp.costos(1, 20).items, [
    { codigo: 'LEGADO', nombre: 'Pieza anterior', stock_actual: 10, costo_unitario_clp: null },
  ]);
  datos.db.prepare('UPDATE repuestos SET costo_unitario_clp = ? WHERE id = ?').run(1_234, id);
  new IntegracionesERP(datos, inventario);
  assert.equal(inventario.obtener(id).costo_unitario_clp, 1_234);
  assert.deepEqual(datos.db.pragma('foreign_key_check'), []);
});
