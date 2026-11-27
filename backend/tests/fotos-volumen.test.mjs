import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Datos } from '../dist/datos.js';
import { Fallas } from '../dist/fallas.js';
import { OrdenesTrabajo } from '../dist/ordenes.js';
import { InventarioRepuestos } from '../dist/repuestos.js';
import { migrarArchivosFotos } from '../dist/tenants.js';

const bytes = Buffer.from('iVBORw0KGgo=', 'base64');
const foto = { nombre: 'prensa.png', tipo: 'image/png', contenido_base64: bytes.toString('base64') };

test('La migración conserva fotos antiguas. Los archivos nuevos sobreviven al reinicio y se limpian si hay una reversión', t => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sigem-prueba-fotos-'));
  const ruta = join(carpeta, 'sqlite', 'app.db');
  const uploadsDir = join(carpeta, 'archivos');
  let datos = new Datos(ruta);
  t.after(() => {
    datos.close();
    rmSync(carpeta, { recursive: true, force: true });
  });

  const fallasLegadas = new Fallas(datos);
  new OrdenesTrabajo(datos, new InventarioRepuestos(datos));
  datos.migrarTenantsOperativos();
  const supervisor = datos.crearUsuario({
    nombre: 'Supervisor', rol: 'SUPERVISOR', rut: '11111111-1', activo: true, passwordHash: 'hash-de-prueba',
  });
  const equipo = datos.crear({ codigo: 'EQ-0001', nombre: 'Prensa', ubicacion: 'Nave', criticidad: 'ALTA' }, supervisor.id, Date.now());
  const reporte = { equipo_id: equipo.id, descripcion: 'Fuga' };
  const antigua = fallasLegadas.crear(reporte, supervisor.id, Date.now());
  const fotoAntigua = Number(datos.db.prepare(
    'INSERT INTO fotos_falla (tenant_id, falla_id, nombre, tipo, contenido) VALUES (?, ?, ?, ?, ?)',
  ).run(1, antigua.id, foto.nombre, foto.tipo, bytes).lastInsertRowid);

  migrarArchivosFotos(datos.db);
  let fallas = new Fallas(datos, uploadsDir);
  const actual = fallas.crear({ ...reporte, fotos: [foto] }, supervisor.id, Date.now());
  const [nueva] = fallas.detalle(actual.id).fotos;
  const registro = datos.db.prepare('SELECT contenido, archivo FROM fotos_falla WHERE id=?').get(nueva.id);
  assert.equal(registro.contenido, null);
  assert.deepEqual(readFileSync(join(uploadsDir, registro.archivo)), bytes);
  assert.deepEqual(readdirSync(uploadsDir), [registro.archivo]);

  datos.close();
  datos = new Datos(ruta);
  migrarArchivosFotos(datos.db);
  fallas = new Fallas(datos, uploadsDir);
  assert.deepEqual(fallas.foto(actual.id, nueva.id).contenido, bytes);
  assert.deepEqual(fallas.foto(antigua.id, fotoAntigua).contenido, bytes);
  assert.throws(() => datos.enTenant(99, () => fallas.foto(actual.id, nueva.id)), { codigo: 'FOTO_NO_ENCONTRADA' });
  datos.db.exec("CREATE TRIGGER aviso_rechazado BEFORE INSERT ON notificaciones_falla BEGIN SELECT RAISE(ABORT,'Prueba de reversión'); END");
  assert.throws(() => fallas.crear({ ...reporte, fotos: [foto, foto] }, supervisor.id, Date.now()), /Prueba de reversión/);
  assert.equal(datos.db.prepare('SELECT count(*) AS n FROM fallas').get().n, 2);
  assert.deepEqual(readdirSync(uploadsDir), [registro.archivo]);
});
