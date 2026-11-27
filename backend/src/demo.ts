import type Database from 'better-sqlite3';
import type { Rol } from './dominio.js';
import { hashPassword } from './seguridad.js';
import { TENANT_LEGADO_ID } from './tenants.js';

const cuentas: ReadonlyArray<{ rol: Rol; rut: string; nombre: string }> = [
  { rol: 'SUPERVISOR', rut: '11111111-1', nombre: 'Supervisión Demo' },
  { rol: 'TECNICO', rut: '22222222-2', nombre: 'Mantenimiento Demo' },
  { rol: 'TRABAJADOR', rut: '33333333-3', nombre: 'Operación Demo' },
  { rol: 'BODEGA', rut: '44444444-4', nombre: 'Bodega Demo' },
  { rol: 'JEFATURA', rut: '55555555-5', nombre: 'Jefatura Demo' },
];

function baseVacia(db: Database.Database): boolean {
  // La migración siempre crea el cliente legado. Solo ese registro intacto cuenta como base nueva.
  if (db.prepare(`SELECT 1 FROM tenants WHERE id <> ? OR nombre_empresa <> 'Manufacturas Andina S.A.'
      OR plan <> 'EMPRESA' OR estado <> 'ACTIVO' LIMIT 1`).get(TENANT_LEGADO_ID)) return false;
  const tablas = db.prepare<[], { name: string }>(`
    SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*'
      AND name NOT IN ('tenants','migraciones')`).all();
  return tablas.every(({ name }) => {
    const tabla = '"' + name.replaceAll('"', '""') + '"';
    return !db.prepare('SELECT 1 FROM ' + tabla + ' LIMIT 1').get();
  });
}

export async function sembrarDemo(db: Database.Database, entorno = process.env): Promise<boolean> {
  if (!baseVacia(db)) return false;
  const claves = cuentas.map(({ rol }) => {
    const variable = 'DEMO_PASSWORD_' + rol;
    const clave = entorno[variable];
    if (!clave || clave.trim().length < 16 || Buffer.byteLength(clave) > 72) {
      throw new Error('Configura ' + variable + ' con al menos 16 caracteres y un máximo de 72 bytes.');
    }
    return clave;
  });
  if (new Set(claves).size !== claves.length) throw new Error('Las cinco contraseñas demo deben ser distintas.');
  const hashes = await Promise.all(claves.map(hashPassword));
  return db.transaction(() => {
    // Revalidar bajo el bloqueo de escritura impide que dos inicios mezclen sus semillas.
    if (!baseVacia(db)) return false;
    db.prepare('UPDATE tenants SET nombre_empresa = ? WHERE id = ?').run('Manufacturas Andina · Demo', TENANT_LEGADO_ID);
    const usuario = db.prepare(`INSERT INTO usuarios(tenant_id,rut,nombre,rol,password_hash,activo)
      VALUES(?,?,?,?,?,1)`);
    for (const [i, cuenta] of cuentas.entries()) {
      usuario.run(TENANT_LEGADO_ID, cuenta.rut, cuenta.nombre, cuenta.rol, hashes[i]);
    }
    const ahora = new Date().toISOString();
    const equipo = db.prepare(`INSERT INTO activos(tenant_id,codigo,nombre,ubicacion,criticidad,estado,fecha_alta)
      VALUES(?,?,?,?,?,'OPERATIVO',?)`);
    equipo.run(TENANT_LEGADO_ID, 'EQ-0001', 'Prensa hidráulica', 'Línea de conformado', 'ALTA', ahora);
    equipo.run(TENANT_LEGADO_ID, 'EQ-0002', 'Compresor de aire', 'Sala de servicios', 'MEDIA', ahora);

    const repuesto = db.prepare(`INSERT INTO repuestos(tenant_id,codigo,nombre,stock_actual,stock_minimo,costo_unitario_clp)
      VALUES(?,?,?,?,?,?)`);
    const entrada = db.prepare(`INSERT INTO movimientos_repuestos(tenant_id,repuesto_id,usuario_id,tipo,cantidad,motivo,fecha)
      SELECT tenant_id,?,id,'ENTRADA',?,'Stock inicial de demostración',? FROM usuarios WHERE tenant_id=? AND rol='BODEGA'`);
    const catalogo = [
      { codigo: 'REP-0001', nombre: 'Filtro de aire', cantidad: 8, minimo: 2, costo: 12500 },
      { codigo: 'REP-0002', nombre: 'Sello hidráulico', cantidad: 12, minimo: 3, costo: 6800 },
    ];
    for (const item of catalogo) {
      const alta = repuesto.run(TENANT_LEGADO_ID, item.codigo, item.nombre, item.cantidad, item.minimo, item.costo);
      entrada.run(alta.lastInsertRowid, item.cantidad, ahora, TENANT_LEGADO_ID);
    }
    return true;
  }).immediate();
}
