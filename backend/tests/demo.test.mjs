import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAplicacion } from '../dist/app.js';
import { sembrarDemo } from '../dist/demo.js';
import { rutValido, verificarPassword } from '../dist/seguridad.js';

const roles = ['BODEGA', 'JEFATURA', 'SUPERVISOR', 'TECNICO', 'TRABAJADOR'];
const claves = Object.fromEntries(roles.map(rol => ['DEMO_PASSWORD_' + rol, 'Prueba-SIGEM-solo-para-' + rol]));

async function base(t) {
  const app = await crearAplicacion({ secret: 'secreto-exclusivo-para-pruebas-demo-sigem' });
  t.after(() => app.close());
  return app.datos.db;
}

test('Una demo nueva contiene cinco roles con claves válidas e inventario trazable, incluso con dos arranques', async t => {
  const db = await base(t);
  const resultados = await Promise.all([sembrarDemo(db, claves), sembrarDemo(db, claves)]);
  assert.deepEqual(resultados.sort(), [false, true]);
  const usuarios = db.prepare('SELECT rut, rol, tenant_id, password_hash FROM usuarios ORDER BY rol').all();
  assert.deepEqual(usuarios.map(u => u.rol), roles);
  for (const usuario of usuarios) {
    assert.equal(usuario.tenant_id, 1);
    assert.equal(rutValido(usuario.rut), true);
    assert.equal(await verificarPassword(claves['DEMO_PASSWORD_' + usuario.rol], usuario.password_hash), true);
  }
  assert.equal(db.prepare('SELECT count(*) FROM activos WHERE tenant_id=1').pluck().get(), 2);
  assert.equal(db.prepare('SELECT count(*) FROM repuestos WHERE tenant_id=1').pluck().get(), 2);
  const saldos = db.prepare(`
    SELECT r.stock_actual AS stock, SUM(m.cantidad) AS entradas
    FROM repuestos r LEFT JOIN movimientos_repuestos m ON m.repuesto_id=r.id AND m.tipo='ENTRADA'
    GROUP BY r.id`).all();
  assert.ok(saldos.every(s => s.stock > 0 && s.stock === s.entradas));
  assert.equal(await sembrarDemo(db, {}), false);
});

test('Una base con datos parciales de negocio se respeta aunque no tenga usuarios', async t => {
  const db = await base(t);
  db.prepare("INSERT INTO sedes(tenant_id,nombre,direccion) VALUES(1,'Planta existente','Norte')").run();
  assert.equal(await sembrarDemo(db, {}), false);
  assert.equal(db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get(), 0);
  assert.equal(db.prepare('SELECT nombre_empresa FROM tenants WHERE id=1').pluck().get(), 'Manufacturas Andina S.A.');
});

test('Un error durante el seed revierte el cliente, las cuentas y el catálogo de la demo', async t => {
  const db = await base(t);
  await assert.rejects(sembrarDemo(db, {}), /DEMO_PASSWORD_/);
  await assert.rejects(sembrarDemo(db, { ...claves, DEMO_PASSWORD_JEFATURA: claves.DEMO_PASSWORD_TECNICO }), /distintas/);
  db.exec("CREATE TRIGGER fallo_prueba BEFORE INSERT ON repuestos BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END");
  await assert.rejects(sembrarDemo(db, claves), /fallo de prueba/);
  assert.equal(db.prepare('SELECT nombre_empresa FROM tenants WHERE id=1').pluck().get(), 'Manufacturas Andina S.A.');
  assert.equal(db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM activos').pluck().get(), 0);
});
