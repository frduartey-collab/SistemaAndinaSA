import type { Datos } from './datos.js';
import type { SedeRespuesta, SedeSolicitud } from './dominio.js';
import { ErrorAPI } from './errores.js';

export class Sedes {
  constructor(private readonly datos: Datos) {}

  listar(): SedeRespuesta[] {
    return this.datos.db.prepare<[number, number | null, number | null], SedeRespuesta>(
      'SELECT id, nombre, direccion FROM sedes WHERE tenant_id = ? AND (? IS NULL OR id = ?) ORDER BY nombre COLLATE NOCASE, id',
    ).all(this.datos.tenantId, this.datos.sedeId, this.datos.sedeId);
  }

  obtener(id: number): SedeRespuesta {
    const sede = this.datos.db.prepare<[number, number, number | null, number | null], SedeRespuesta>(
      'SELECT id, nombre, direccion FROM sedes WHERE id = ? AND tenant_id = ? AND (? IS NULL OR id = ?)',
    ).get(id, this.datos.tenantId, this.datos.sedeId, this.datos.sedeId);
    if (!sede) throw new ErrorAPI(404, 'SEDE_NO_ENCONTRADA', 'No se encontró la sede de tu organización.');
    return sede;
  }

  crear(ficha: SedeSolicitud, actorId: number, ahora: number): SedeRespuesta {
    this.exigirGestionGlobal();
    return this.datos.transaccion(() => {
      const nombre = ficha.nombre.trim();
      this.verificarNombre(nombre, null);
      const insertada = this.datos.db.prepare(
        'INSERT INTO sedes (tenant_id, nombre, direccion) VALUES (?, ?, ?)',
      ).run(this.datos.tenantId, nombre, ficha.direccion.trim());
      const id = Number(insertada.lastInsertRowid);
      this.datos.auditar(actorId, 'SEDE_CREADA', id, ahora);
      return this.obtener(id);
    });
  }

  editar(id: number, ficha: SedeSolicitud, actorId: number, ahora: number): SedeRespuesta {
    this.exigirGestionGlobal();
    return this.datos.transaccion(() => {
      this.obtener(id);
      const nombre = ficha.nombre.trim();
      this.verificarNombre(nombre, id);
      this.datos.db.prepare('UPDATE sedes SET nombre = ?, direccion = ? WHERE id = ? AND tenant_id = ?')
        .run(nombre, ficha.direccion.trim(), id, this.datos.tenantId);
      this.datos.auditar(actorId, 'SEDE_MODIFICADA', id, ahora);
      return this.obtener(id);
    });
  }

  eliminar(id: number, actorId: number, ahora: number): void {
    this.exigirGestionGlobal();
    this.datos.transaccion(() => {
      this.obtener(id);
      if (this.datos.db.prepare('SELECT 1 FROM usuarios WHERE sede_id = ? AND tenant_id = ? LIMIT 1')
        .get(id, this.datos.tenantId)) {
        throw new ErrorAPI(409, 'SEDE_EN_USO', 'La sede tiene usuarios asignados. Quita las asignaciones antes de eliminarla.');
      }
      if (this.datos.db.prepare('SELECT 1 FROM activos WHERE sede_id = ? AND tenant_id = ? LIMIT 1')
        .get(id, this.datos.tenantId)) {
        throw new ErrorAPI(409, 'SEDE_EN_USO', 'La sede tiene equipos asignados. Quita las asignaciones antes de eliminarla.');
      }
      this.datos.db.prepare('DELETE FROM sedes WHERE id = ? AND tenant_id = ?').run(id, this.datos.tenantId);
      this.datos.auditar(actorId, 'SEDE_ELIMINADA', id, ahora);
    });
  }

  private verificarNombre(nombre: string, id: number | null): void {
    if (this.datos.db.prepare(
      'SELECT 1 FROM sedes WHERE tenant_id = ? AND nombre = ? COLLATE NOCASE AND id IS NOT ?',
    ).get(this.datos.tenantId, nombre, id)) {
      throw new ErrorAPI(409, 'SEDE_DUPLICADA', 'Ya existe una sede con ese nombre en tu organización.');
    }
  }
  private exigirGestionGlobal(): void {
    if (this.datos.sedeId !== null) {
      throw new ErrorAPI(403, 'SIN_PERMISO', 'Una cuenta restringida a una sede no puede gestionar sedes.');
    }
  }
}
