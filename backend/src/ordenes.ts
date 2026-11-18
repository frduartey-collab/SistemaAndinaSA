import type { Datos } from './datos.js';
import type {
  ConsultaOrdenes, ConsultaTecnicos, EstadoOrden, OrdenCrearSolicitud,
  OrdenRespuesta, PaginaOrdenes, PaginaTecnicos, TecnicoResumen,
} from './dominio.js';
import { ErrorAPI } from './errores.js';

const SELECCION = `
  SELECT o.id, o.falla_id, o.tecnico_id, u.nombre AS tecnico_nombre,
         a.codigo AS equipo_codigo, a.nombre AS equipo_nombre, f.descripcion,
         f.prioridad, o.fecha_limite, o.estado
  FROM ordenes_trabajo o
  JOIN fallas f ON f.id = o.falla_id
  JOIN activos a ON a.id = f.equipo_id
  JOIN usuarios u ON u.id = o.tecnico_id
`;

const FORMATO_CHILE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});

const SIGUIENTE_ESTADO: Record<EstadoOrden, EstadoOrden | null> = {
  PENDIENTE: 'EN_PROGRESO',
  EN_PROGRESO: 'CERRADA',
  CERRADA: null,
};

export class OrdenesTrabajo {
  constructor(private readonly datos: Datos) {
    this.datos.db.exec(`
      CREATE TABLE IF NOT EXISTS ordenes_trabajo (
        id INTEGER PRIMARY KEY,
        falla_id INTEGER NOT NULL UNIQUE REFERENCES fallas(id),
        tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
        fecha_limite TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'CERRADA'))
      );
      CREATE INDEX IF NOT EXISTS ordenes_por_tecnico ON ordenes_trabajo(tecnico_id, id DESC);
    `);
  }

  crear(input: OrdenCrearSolicitud, actorId: number, ahora: number): OrdenRespuesta {
    if (input.fecha_limite < FORMATO_CHILE.format(ahora)) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La fecha límite debe ser hoy o una fecha posterior.');
    }

    return this.datos.transaccion(() => {
      const falla = this.datos.db.prepare<[number], { equipo_id: number }>(
        "SELECT equipo_id FROM fallas WHERE id = ? AND estado = 'REPORTADA'",
      ).get(input.falla_id);
      if (!falla) throw new ErrorAPI(404, 'FALLA_NO_ENCONTRADA', 'La falla reportada no existe.');
      this.datos.obtener(falla.equipo_id);

      const tecnico = this.datos.usuarioPorId(input.tecnico_id);
      if (!tecnico?.activo || tecnico.rol !== 'TECNICO') {
        throw new ErrorAPI(409, 'TECNICO_NO_DISPONIBLE', 'Selecciona un técnico activo.');
      }

      const existente = this.datos.db.prepare('SELECT id FROM ordenes_trabajo WHERE falla_id = ?').get(input.falla_id);
      if (existente) throw new ErrorAPI(409, 'ORDEN_DUPLICADA', 'Esta falla ya tiene una orden de trabajo.');

      const insercion = this.datos.db.prepare(`
        INSERT INTO ordenes_trabajo(falla_id, tecnico_id, fecha_limite) VALUES (?, ?, ?)
      `).run(input.falla_id, input.tecnico_id, input.fecha_limite);
      const id = Number(insercion.lastInsertRowid);
      this.datos.auditar(actorId, 'ORDEN_CREADA', id, ahora);
      return this.obtener(id);
    });
  }

  listar(consulta: ConsultaOrdenes, tecnicoId?: number): PaginaOrdenes {
    const where = tecnicoId === undefined ? '' : ' WHERE o.tecnico_id = ?';
    const parametros = tecnicoId === undefined ? [] : [tecnicoId];
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<number[], OrdenRespuesta>(
        SELECCION + where + ' ORDER BY o.id DESC LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const { total } = this.datos.db.prepare<number[], { total: number }>(
        'SELECT count(*) AS total FROM ordenes_trabajo o' + where,
      ).get(...parametros)!;
      return { items, total, page: consulta.page, size: consulta.size };
    })();
  }

  listarTecnicos(consulta: ConsultaTecnicos): PaginaTecnicos {
    const busqueda = consulta.q?.trim();
    const filtro = " WHERE rol = 'TECNICO' AND activo = 1"
      + (busqueda ? ' AND instr(lower(nombre), lower(?)) > 0' : '');
    const parametros = busqueda ? [busqueda] : [];
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<Array<string | number>, TecnicoResumen>(
        'SELECT id, nombre FROM usuarios' + filtro + ' ORDER BY nombre COLLATE NOCASE, id LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const { total } = this.datos.db.prepare<string[], { total: number }>(
        'SELECT count(*) AS total FROM usuarios' + filtro,
      ).get(...parametros)!;
      return { items, total, page: consulta.page, size: consulta.size };
    })();
  }

  cambiarEstado(id: number, nuevo: EstadoOrden, actorId: number, administrador: boolean, ahora: number): OrdenRespuesta {
    return this.datos.transaccion(() => {
      const orden = this.obtener(id, administrador ? undefined : actorId);
      if (orden.estado === nuevo) return orden;
      if (SIGUIENTE_ESTADO[orden.estado] !== nuevo) {
        throw new ErrorAPI(409, 'TRANSICION_ORDEN_INVALIDA', 'Solo puedes avanzar al siguiente estado de la orden.');
      }

      this.datos.db.prepare('UPDATE ordenes_trabajo SET estado = ? WHERE id = ?').run(nuevo, id);
      this.datos.auditar(actorId, 'ORDEN_ESTADO_' + nuevo, id, ahora);
      return { ...orden, estado: nuevo };
    });
  }

  private obtener(id: number, tecnicoId?: number): OrdenRespuesta {
    const filtro = tecnicoId === undefined ? ' WHERE o.id = ?' : ' WHERE o.id = ? AND o.tecnico_id = ?';
    const parametros = tecnicoId === undefined ? [id] : [id, tecnicoId];
    const orden = this.datos.db.prepare<number[], OrdenRespuesta>(SELECCION + filtro).get(...parametros);
    if (!orden) throw new ErrorAPI(404, 'ORDEN_NO_ENCONTRADA', 'No se encontró la orden de trabajo.');
    return orden;
  }
}
