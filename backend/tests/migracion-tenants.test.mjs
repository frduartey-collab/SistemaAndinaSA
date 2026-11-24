import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { OrdenesTrabajo } from '../dist/ordenes.js';
import { InventarioRepuestos } from '../dist/repuestos.js';

const AHORA = Date.parse('2026-11-20T17:00:00Z');
const ISO = new Date(AHORA).toISOString();
const activo = { codigo: 'EQ-4100', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA' };

test('La migración conserva IDs y datos legados, incluso al reabrir SQLite', t => {
  const carpeta = mkdtempSync(join(tmpdir(), 'migra-andina-'));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  const ruta = join(carpeta, 'app.db');
  const legado = new Database(ruta);
  legado.pragma('foreign_keys = OFF');
  legado.exec(
    "CREATE TABLE usuarios (id INTEGER PRIMARY KEY, rut TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, password_hash TEXT NOT NULL, rol TEXT NOT NULL, activo INTEGER NOT NULL);" +
    "INSERT INTO usuarios VALUES(7,'11111111-1','Existente','hash legado','SUPERVISOR',1);" +
    "CREATE TABLE equipos(id INTEGER PRIMARY KEY,codigo TEXT UNIQUE,nombre TEXT,ubicacion TEXT,criticidad TEXT,estado TEXT,creado_en TEXT,eliminado_en TEXT);" +
    "INSERT INTO equipos VALUES(21,'EQ-4100','Prensa antigua','Nave','MEDIA','OPERATIVO','2026-10-07T17:00:00.000Z',NULL);" +
    "CREATE TABLE fallas(id INTEGER PRIMARY KEY,equipo_id INTEGER NOT NULL REFERENCES activos(id),usuario_id INTEGER NOT NULL REFERENCES usuarios(id),descripcion TEXT,prioridad TEXT,estado TEXT,fecha_reporte TEXT);" +
    "INSERT INTO fallas VALUES(30,21,7,'Vibración','ALTA','REPORTADA','2026-10-08T17:00:00.000Z');" +
    "CREATE TABLE repuestos (id INTEGER PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,descripcion TEXT,stock_actual INTEGER NOT NULL,stock_minimo INTEGER NOT NULL,deleted_at TEXT);" +
    "INSERT INTO repuestos VALUES(60,'RP-001','Pieza antigua',NULL,7,2,NULL);"
  );
  legado.close();

  function abrir() {
    const datos = new Datos(ruta);
    new Fallas(datos);
    const inventario = new InventarioRepuestos(datos);
    new OrdenesTrabajo(datos, inventario);
    datos.migrarTenantsOperativos();
    return datos;
  }

  let datos = abrir();
  try {
    const tenant = datos.tenantPorId(1);
    assert.equal(tenant.plan, 'EMPRESA');
    assert.equal(tenant.nombre_empresa, 'Manufacturas Andina S.A.');
    assert.equal(datos.usuarioPorIdGlobal(7).passwordHash, 'hash legado');
    assert.equal(datos.obtener(21).nombre, 'Prensa antigua');
    assert.deepEqual(datos.db.prepare('SELECT tenant_id, descripcion FROM fallas WHERE id = 30').get(), { tenant_id: 1, descripcion: 'Vibración' });
    assert.deepEqual(datos.db.prepare('SELECT tenant_id, stock_actual FROM repuestos WHERE id = 60').get(), { tenant_id: 1, stock_actual: 7 });
    assert.deepEqual(datos.db.pragma('foreign_key_check'), []);
    for (const tabla of [
      'usuarios', 'activos', 'fallas', 'ordenes_trabajo', 'repuestos', 'sesiones',
      'auditoria', 'fotos_falla', 'notificaciones_falla', 'intervenciones', 'orden_repuesto', 'movimientos_repuestos',
    ]) assert(datos.db.pragma('table_info(' + tabla + ')').some(columna => columna.name === 'tenant_id' && columna.notnull === 1), tabla);

    const otra = datos.crearTenant('Empresa nueva', 'EMPRESA', AHORA);
    datos.enTenant(otra.id, () => {
      const usuario = datos.crearUsuario({ rut: '22222222-2', nombre: 'Nuevo', rol: 'JEFATURA', activo: true, passwordHash: 'hash nuevo' });
      datos.crear(activo, usuario.id, AHORA);
      datos.db.prepare('INSERT INTO repuestos(codigo,nombre,stock_minimo,tenant_id) VALUES(?,?,?,?)').run('rp-001', 'Otro', 0, otra.id);
      assert.throws(() => datos.obtener(21), { codigo: 'ACTIVO_NO_ENCONTRADO' });
      assert.equal(datos.usuarioPorId(7), undefined);
      assert.throws(() => datos.crearSesion('sintetica', 7, 'hash de sesión', AHORA), /entre empresas/);
      assert.throws(() => datos.db.prepare('UPDATE fallas SET tenant_id = ? WHERE id = ?').run(otra.id, 30), /inmutable/);
    });
    assert.equal(datos.tenantId, 1);
    assert.equal(datos.listar({ page: 1, size: 20 }).total, 1);
    datos.close();
    datos = abrir();
    assert.equal(datos.obtener(21).nombre, 'Prensa antigua');
    assert.equal(datos.db.prepare('SELECT count(*) AS total FROM repuestos').get().total, 2);
    assert.equal(datos.db.prepare('SELECT count(*) AS total FROM fallas').get().total, 1);
  } finally {
    datos.close();
  }
});

test('El plan Particular tiene cupo de 15 vigentes y las sedes requieren Empresa', () => {
  const datos = new Datos();
  try {
    const particular = datos.crearTenant('Taller', 'PARTICULAR', AHORA);
    const empresa = datos.crearTenant('Fábrica', 'EMPRESA', AHORA);
    const insertarSede = datos.db.prepare('INSERT INTO sedes(tenant_id,nombre,direccion) VALUES(?,?,?)');
    const sede = Number(insertarSede.run(empresa.id, 'Nave norte', 'Calle 1').lastInsertRowid);
    datos.enTenant(particular.id, () => {
      const actor = datos.crearUsuario({ rut: '22222222-2', nombre: 'Jefatura', rol: 'JEFATURA', activo: true, passwordHash: 'hash' });
      assert.throws(() => datos.crear({ ...activo, sede_id: sede }, actor.id, AHORA), { codigo: 'PLAN_EMPRESA_REQUERIDO' });
      const registros = Array.from({ length: 15 }, (_, i) => datos.crear(
        { ...activo, codigo: 'EQ-' + String(i).padStart(4, '0') }, actor.id, AHORA,
      ));
      assert.throws(() => datos.crear(activo, actor.id, AHORA), { codigo: 'CUPO_EQUIPOS_ALCANZADO' });
      datos.eliminar(registros[0].id, actor.id, AHORA);
      assert.equal(datos.crear(activo, actor.id, AHORA).codigo, activo.codigo);
    });
    datos.enTenant(empresa.id, () => {
      const actor = datos.crearUsuario({ rut: '33333333-3', nombre: 'Jefatura', rol: 'JEFATURA', activo: true, passwordHash: 'hash' });
      const sedeAjena = Number(insertarSede.run(1, 'Nave sur', 'Calle 2').lastInsertRowid);
      assert.throws(() => datos.crear({ ...activo, sede_id: sedeAjena }, actor.id, AHORA), { codigo: 'SEDE_NO_ENCONTRADA' });
      const asignado = datos.crear({ ...activo, sede_id: sede }, actor.id, AHORA);
      assert.equal(asignado.sede_id, sede);
      assert.equal(datos.modificar(asignado.id, { sede_id: null }, actor.id, AHORA).sede_id, undefined);
    });
    assert.deepEqual(datos.db.pragma('foreign_key_check'), []);
    assert.equal(datos.db.prepare('SELECT fecha_suscripcion FROM tenants WHERE id=?').get(empresa.id).fecha_suscripcion, ISO);
  } finally {
    datos.close();
  }
});
