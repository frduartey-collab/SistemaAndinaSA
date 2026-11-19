import type { Datos } from './datos.js';
import type {
  ConsultaOrdenes, ConsultaTecnicos, IntervencionRespuesta, OrdenCierreSolicitud,
  OrdenCrearSolicitud, OrdenDetalleRespuesta, OrdenEstadoSolicitud, OrdenRespuesta,
  PaginaOrdenes, PaginaTecnicos, TecnicoResumen,
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

      CREATE TABLE IF NOT EXISTS intervenciones (
        orden_id INTEGER PRIMARY KEY REFERENCES ordenes_trabajo(id),
        autor_id INTEGER NOT NULL REFERENCES usuarios(id),
        diagnostico TEXT NOT NULL CHECK (length(diagnostico) BETWEEN 1 AND 2000),
        solucion TEXT NOT NULL CHECK (length(solucion) BETWEEN 1 AND 2000),
        duracion_minutos INTEGER NOT NULL
          CHECK (typeof(duracion_minutos) = 'integer' AND duracion_minutos BETWEEN 1 AND 9007199254740991),
        repuestos_usados TEXT CHECK (length(repuestos_usados) BETWEEN 1 AND 2000),
        registrada_en TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS validar_autor_intervencion
      BEFORE INSERT ON intervenciones
      WHEN NOT EXISTS (
        SELECT 1 FROM ordenes_trabajo
        WHERE id = NEW.orden_id AND tecnico_id = NEW.autor_id AND estado = 'EN_PROGRESO'
      )
      BEGIN SELECT RAISE(ABORT, 'La intervención requiere una orden en progreso de su técnico.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_edicion_intervencion
      BEFORE UPDATE ON intervenciones
      BEGIN SELECT RAISE(ABORT, 'La intervención es inmutable.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_borrado_intervencion
      BEFORE DELETE ON intervenciones
      BEGIN SELECT RAISE(ABORT, 'La intervención es inmutable.'); END;
      CREATE TRIGGER IF NOT EXISTS validar_cierre_orden
      BEFORE UPDATE OF estado ON ordenes_trabajo
      WHEN OLD.estado <> 'CERRADA' AND NEW.estado = 'CERRADA'
        AND (OLD.estado <> 'EN_PROGRESO' OR NOT EXISTS (
          SELECT 1 FROM intervenciones WHERE orden_id = OLD.id
        ))
      BEGIN SELECT RAISE(ABORT, 'El cierre requiere una intervención en una orden en progreso.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_edicion_orden_cerrada
      BEFORE UPDATE ON ordenes_trabajo WHEN OLD.estado = 'CERRADA'
      BEGIN SELECT RAISE(ABORT, 'La orden cerrada es inmutable.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_borrado_orden_cerrada
      BEFORE DELETE ON ordenes_trabajo WHEN OLD.estado = 'CERRADA'
      BEGIN SELECT RAISE(ABORT, 'La orden cerrada es inmutable.'); END;
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
    const condiciones: string[] = [];
    const parametros = tecnicoId === undefined ? [] : [tecnicoId];
    if (tecnicoId !== undefined) condiciones.push('o.tecnico_id = ?');
    if (consulta.solo_abiertas) condiciones.push("o.estado IN ('PENDIENTE', 'EN_PROGRESO')");
    const where = condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '';
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

  cambiarEstado(id: number, nuevo: OrdenEstadoSolicitud['estado'], actorId: number, administrador: boolean, ahora: number): OrdenRespuesta {
    return this.datos.transaccion(() => {
      const orden = this.obtener(id, administrador ? undefined : actorId);
      if (orden.estado === nuevo) return orden;
      if (orden.estado !== 'PENDIENTE') {
        throw new ErrorAPI(409, 'TRANSICION_ORDEN_INVALIDA', 'Solo una orden pendiente puede pasar a En progreso.');
      }

      this.datos.db.prepare('UPDATE ordenes_trabajo SET estado = ? WHERE id = ?').run(nuevo, id);
      this.datos.auditar(actorId, 'ORDEN_ESTADO_' + nuevo, id, ahora);
      return { ...orden, estado: nuevo };
    });
  }

  detalle(id: number, tecnicoId?: number): OrdenDetalleRespuesta {
    return this.datos.db.transaction(() => ({
      ...this.obtener(id, tecnicoId),
      intervencion: this.obtenerIntervencion(id),
    }))();
  }

  cerrar(id: number, input: OrdenCierreSolicitud, tecnicoId: number, ahora: number): OrdenDetalleRespuesta {
    const diagnostico = input.diagnostico.trim();
    const solucion = input.solucion.trim();
    const repuestos = input.repuestos_usados?.trim() || null;

    return this.datos.transaccion(() => {
      const orden = this.obtener(id, tecnicoId);
      if (orden.estado === 'CERRADA') {
        const intervencion = this.obtenerIntervencion(id);
        if (intervencion?.diagnostico === diagnostico && intervencion.solucion === solucion
          && intervencion.duracion_minutos === input.duracion_minutos && intervencion.repuestos_usados === repuestos) {
          return { ...orden, intervencion };
        }
        throw new ErrorAPI(409, 'ORDEN_YA_CERRADA', 'La orden ya está cerrada y su intervención no puede modificarse.');
      }
      if (orden.estado !== 'EN_PROGRESO') {
        throw new ErrorAPI(409, 'TRANSICION_ORDEN_INVALIDA', 'Solo se puede cerrar una orden en progreso.');
      }

      const intervencion: IntervencionRespuesta = {
        orden_id: id,
        autor_id: tecnicoId,
        diagnostico,
        solucion,
        duracion_minutos: input.duracion_minutos,
        repuestos_usados: repuestos,
        registrada_en: new Date(ahora).toISOString(),
      };
      this.datos.db.prepare(`
        INSERT INTO intervenciones
          (orden_id, autor_id, diagnostico, solucion, duracion_minutos, repuestos_usados, registrada_en)
        VALUES (@orden_id, @autor_id, @diagnostico, @solucion, @duracion_minutos, @repuestos_usados, @registrada_en)
      `).run(intervencion);
      this.datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'CERRADA' WHERE id = ?").run(id);
      this.datos.auditar(tecnicoId, 'ORDEN_CERRADA_CON_INTERVENCION', id, ahora);
      return { ...orden, estado: 'CERRADA', intervencion };
    });
  }

  private obtenerIntervencion(id: number): IntervencionRespuesta | null {
    return this.datos.db.prepare<[number], IntervencionRespuesta>(`
      SELECT orden_id, autor_id, diagnostico, solucion, duracion_minutos, repuestos_usados, registrada_en
      FROM intervenciones WHERE orden_id = ?
    `).get(id) ?? null;
  }

  private obtener(id: number, tecnicoId?: number): OrdenRespuesta {
    const filtro = tecnicoId === undefined ? ' WHERE o.id = ?' : ' WHERE o.id = ? AND o.tecnico_id = ?';
    const parametros = tecnicoId === undefined ? [id] : [id, tecnicoId];
    const orden = this.datos.db.prepare<number[], OrdenRespuesta>(SELECCION + filtro).get(...parametros);
    if (!orden) throw new ErrorAPI(404, 'ORDEN_NO_ENCONTRADA', 'No se encontró la orden de trabajo.');
    return orden;
  }
}
