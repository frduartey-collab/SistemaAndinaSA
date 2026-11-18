import type { Datos } from './datos.js';
import type { ConsultaFallas, FallaCrearSolicitud, FallaRespuesta, PaginaFallas } from './dominio.js';

const SELECCION_FALLAS = `
  SELECT f.id, f.equipo_id, a.codigo AS equipo_codigo, a.nombre AS equipo_nombre,
         f.usuario_id, u.nombre AS usuario_nombre, f.descripcion, f.prioridad,
         f.estado, f.fecha_reporte
  FROM fallas f
  JOIN activos a ON a.id = f.equipo_id
  JOIN usuarios u ON u.id = f.usuario_id
`;

export class Fallas {
  constructor(private readonly datos: Datos) {
    this.datos.db.exec(`
      CREATE TABLE IF NOT EXISTS fallas (
        id INTEGER PRIMARY KEY,
        equipo_id INTEGER NOT NULL REFERENCES activos(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        descripcion TEXT NOT NULL CHECK(length(trim(descripcion)) BETWEEN 1 AND 2000),
        prioridad TEXT NOT NULL CHECK(prioridad IN ('ALTA','MEDIA','BAJA')),
        estado TEXT NOT NULL DEFAULT 'REPORTADA' CHECK(estado = 'REPORTADA'),
        fecha_reporte TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS fallas_por_fecha ON fallas(fecha_reporte DESC, id DESC);
      CREATE INDEX IF NOT EXISTS fallas_por_usuario ON fallas(usuario_id, fecha_reporte DESC, id DESC);
    `);
  }

  crear(input: FallaCrearSolicitud, usuarioId: number, ahora: number): FallaRespuesta {
    return this.datos.transaccion(() => {
      const equipo = this.datos.obtener(input.equipo_id);
      const fecha = new Date(ahora).toISOString();
      const { lastInsertRowid } = this.datos.db.prepare(`
        INSERT INTO fallas(equipo_id, usuario_id, descripcion, prioridad, fecha_reporte)
        VALUES (?, ?, ?, ?, ?)
      `).run(equipo.id, usuarioId, input.descripcion.trim(), input.prioridad ?? equipo.criticidad, fecha);

      const id = Number(lastInsertRowid);
      this.datos.auditar(usuarioId, 'FALLA_REPORTADA', id, ahora);
      return this.datos.db.prepare<[number], FallaRespuesta>(SELECCION_FALLAS + ' WHERE f.id = ?').get(id)!;
    });
  }

  listar(consulta: ConsultaFallas, usuarioId?: number): PaginaFallas {
    const condiciones: string[] = [];
    const parametros = usuarioId === undefined ? [] : [usuarioId];
    if (usuarioId !== undefined) condiciones.push('f.usuario_id = ?');
    if (consulta.sin_orden) {
      condiciones.push("f.estado = 'REPORTADA'", 'a.deleted_at IS NULL',
        'NOT EXISTS (SELECT 1 FROM ordenes_trabajo o WHERE o.falla_id = f.id)');
    }
    const where = condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '';
    const offset = (consulta.page - 1) * consulta.size;

    const leerPagina = this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<number[], FallaRespuesta>(
        SELECCION_FALLAS + where + ' ORDER BY f.fecha_reporte DESC, f.id DESC LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const conteo = this.datos.db.prepare<number[], { total: number }>(
        'SELECT count(*) AS total FROM fallas f JOIN activos a ON a.id = f.equipo_id' + where,
      ).get(...parametros)!;
      return { items, total: conteo.total, page: consulta.page, size: consulta.size };
    });
    return leerPagina();
  }
}
