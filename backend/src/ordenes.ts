import type { Datos } from './datos.js';
import type {
  ConsultaOrdenes, ConsultaTecnicos, CriticidadEquipo, IntervencionRespuesta, OrdenCierreSolicitud,
  OrdenCrearSolicitud, OrdenDetalleRespuesta, OrdenEstadoSolicitud, OrdenRespuesta,
  PaginaOrdenes, PaginaTecnicos, RepuestoConsumidoRespuesta, RepuestoConsumoSolicitud, TecnicoResumen,
} from './dominio.js';
import { ErrorAPI } from './errores.js';
import { listarFotosFalla } from './fallas.js';
import type { InventarioRepuestos } from './repuestos.js';

type FilaIntervencion = Omit<IntervencionRespuesta, 'repuestos_consumidos'>;
type FilaOrden = Omit<OrdenRespuesta, 'plan_preventivo_id'> & { plan_preventivo_id: number | null };

interface NuevaOrdenPreventiva {
  planId: number;
  equipoId: number;
  tecnicoId: number;
  ciclo: number;
  fechaLimite: string;
  descripcion: string;
  prioridad: CriticidadEquipo;
}

function ordenRespuesta({ plan_preventivo_id, ...orden }: FilaOrden): OrdenRespuesta {
  return plan_preventivo_id === null ? orden : { ...orden, plan_preventivo_id };
}

function mismoConsumo(guardado: RepuestoConsumidoRespuesta[], solicitado: RepuestoConsumoSolicitud[]): boolean {
  return guardado.length === solicitado.length && guardado.every((repuesto, posicion) =>
    repuesto.repuesto_id === solicitado[posicion].repuesto_id && repuesto.cantidad === solicitado[posicion].cantidad,
  );
}

const SELECCION = `
  SELECT o.id, o.falla_id, o.plan_preventivo_id, o.tecnico_id, u.nombre AS tecnico_nombre,
         a.codigo AS equipo_codigo, a.nombre AS equipo_nombre,
         COALESCE(f.descripcion, o.descripcion_preventiva) AS descripcion,
         COALESCE(f.prioridad, o.prioridad_preventiva) AS prioridad, o.fecha_limite, o.estado
  FROM ordenes_trabajo o
  LEFT JOIN fallas f ON f.id = o.falla_id AND f.tenant_id = o.tenant_id
  JOIN activos a ON a.id = COALESCE(o.equipo_id, f.equipo_id) AND a.tenant_id = o.tenant_id
  JOIN usuarios u ON u.id = o.tecnico_id AND u.tenant_id = o.tenant_id
`;

const FORMATO_CHILE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function fechaCivilChile(ahora: number): string {
  return FORMATO_CHILE.format(ahora);
}

export class OrdenesTrabajo {
  constructor(private readonly datos: Datos, private readonly inventario: InventarioRepuestos) {
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
      CREATE TABLE IF NOT EXISTS orden_repuesto (
        orden_id INTEGER NOT NULL REFERENCES intervenciones(orden_id),
        repuesto_id INTEGER NOT NULL REFERENCES repuestos(id),
        codigo TEXT NOT NULL,
        nombre TEXT NOT NULL,
        cantidad INTEGER NOT NULL
          CHECK (typeof(cantidad) = 'integer' AND cantidad BETWEEN 1 AND 9007199254740991),
        PRIMARY KEY (orden_id, repuesto_id),
        FOREIGN KEY (repuesto_id, orden_id) REFERENCES movimientos_repuestos(repuesto_id, orden_id)
      );
      CREATE TRIGGER IF NOT EXISTS validar_orden_para_consumo
      BEFORE INSERT ON orden_repuesto
      WHEN NOT EXISTS (SELECT 1 FROM ordenes_trabajo WHERE id = NEW.orden_id AND estado = 'EN_PROGRESO')
      BEGIN SELECT RAISE(ABORT, 'El consumo requiere una orden en progreso.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_edicion_consumo
      BEFORE UPDATE ON orden_repuesto
      BEGIN SELECT RAISE(ABORT, 'El consumo es inmutable.'); END;
      CREATE TRIGGER IF NOT EXISTS impedir_borrado_consumo
      BEFORE DELETE ON orden_repuesto
      BEGIN SELECT RAISE(ABORT, 'El consumo es inmutable.'); END;
    `);
  }

  crear(input: OrdenCrearSolicitud, actorId: number, ahora: number): OrdenRespuesta {
    if (input.fecha_limite < fechaCivilChile(ahora)) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La fecha límite debe ser hoy o una fecha posterior.');
    }

    return this.datos.transaccion(() => {
      const falla = this.datos.db.prepare<[number, number], { equipo_id: number }>(
        "SELECT equipo_id FROM fallas WHERE tenant_id = ? AND id = ? AND estado = 'REPORTADA'",
      ).get(this.datos.tenantId, input.falla_id);
      if (!falla) throw new ErrorAPI(404, 'FALLA_NO_ENCONTRADA', 'La falla reportada no existe.');
      const equipo = this.datos.obtener(falla.equipo_id);

      const tecnico = this.datos.usuarioPorId(input.tecnico_id);
      if (!tecnico?.activo || tecnico.rol !== 'TECNICO'
          || (tecnico.sede_id !== undefined && tecnico.sede_id !== equipo.sede_id)) {
        throw new ErrorAPI(409, 'TECNICO_NO_DISPONIBLE', 'Selecciona un técnico activo.');
      }

      const existente = this.datos.db.prepare('SELECT id FROM ordenes_trabajo WHERE tenant_id = ? AND falla_id = ?')
        .get(this.datos.tenantId, input.falla_id);
      if (existente) throw new ErrorAPI(409, 'ORDEN_DUPLICADA', 'Esta falla ya tiene una orden de trabajo.');

      const insercion = this.datos.db.prepare(`
        INSERT INTO ordenes_trabajo(tenant_id, falla_id, tecnico_id, fecha_limite) VALUES (?, ?, ?, ?)
      `).run(this.datos.tenantId, input.falla_id, input.tecnico_id, input.fecha_limite);
      const id = Number(insercion.lastInsertRowid);
      this.datos.auditar(actorId, 'ORDEN_CREADA', id, ahora);
      return this.obtener(id);
    });
  }

  crearPreventivaEnTransaccion(input: NuevaOrdenPreventiva, actorId: number | null, ahora: number): number {
    if (!this.datos.db.inTransaction) throw new Error('La orden preventiva debe generarse dentro de la evaluación.');
    const equipo = this.datos.obtener(input.equipoId);
    const tecnico = this.datos.usuarioPorId(input.tecnicoId);
    if (!tecnico?.activo || tecnico.rol !== 'TECNICO'
        || (tecnico.sede_id !== undefined && tecnico.sede_id !== equipo.sede_id)) {
      throw new ErrorAPI(409, 'TECNICO_NO_DISPONIBLE', 'Selecciona un técnico activo disponible para la sede del equipo.');
    }
    const insercion = this.datos.db.prepare(`
      INSERT INTO ordenes_trabajo(
        tenant_id, plan_preventivo_id, equipo_id, tecnico_id, ciclo_preventivo, fecha_limite,
        descripcion_preventiva, prioridad_preventiva
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(this.datos.tenantId, input.planId, input.equipoId, input.tecnicoId, input.ciclo,
      input.fechaLimite, input.descripcion, input.prioridad);
    const id = Number(insercion.lastInsertRowid);
    this.datos.auditar(actorId, 'ORDEN_CREADA', id, ahora);
    return id;
  }

  listar(consulta: ConsultaOrdenes, tecnicoId?: number): PaginaOrdenes {
    const condiciones = ['o.tenant_id = ?'];
    const parametros = [this.datos.tenantId];
    if (this.datos.sedeId !== null) { condiciones.push('a.sede_id = ?'); parametros.push(this.datos.sedeId); }
    if (tecnicoId !== undefined) { condiciones.push('o.tecnico_id = ?'); parametros.push(tecnicoId); }
    if (consulta.solo_abiertas) condiciones.push("o.estado IN ('PENDIENTE', 'EN_PROGRESO')");
    const where = condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '';
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<number[], FilaOrden>(
        SELECCION + where + ' ORDER BY o.id DESC LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const { total } = this.datos.db.prepare<number[], { total: number }>(
        'SELECT count(*) AS total FROM (' + SELECCION + where + ')',
      ).get(...parametros)!;
      return { items: items.map(ordenRespuesta), total, page: consulta.page, size: consulta.size };
    })();
  }

  listarTecnicos(consulta: ConsultaTecnicos): PaginaTecnicos {
    const busqueda = consulta.q?.trim();
    const filtro = " WHERE tenant_id = ? AND rol = 'TECNICO' AND activo = 1"
      + (this.datos.sedeId === null ? '' : ' AND (sede_id IS NULL OR sede_id = ?)')
      + (busqueda ? ' AND instr(lower(nombre), lower(?)) > 0' : '');
    const parametros: Array<string | number> = [this.datos.tenantId];
    if (this.datos.sedeId !== null) parametros.push(this.datos.sedeId);
    if (busqueda) parametros.push(busqueda);
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<Array<string | number>, TecnicoResumen>(
        'SELECT id, nombre FROM usuarios' + filtro + ' ORDER BY nombre COLLATE NOCASE, id LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const { total } = this.datos.db.prepare<Array<string | number>, { total: number }>(
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

      this.datos.db.prepare('UPDATE ordenes_trabajo SET estado = ? WHERE tenant_id = ? AND id = ?')
        .run(nuevo, this.datos.tenantId, id);
      this.datos.auditar(actorId, 'ORDEN_ESTADO_' + nuevo, id, ahora);
      return { ...orden, estado: nuevo };
    });
  }

  detalle(id: number, tecnicoId?: number): OrdenDetalleRespuesta {
    return this.datos.db.transaction(() => {
      const orden = this.obtener(id, tecnicoId);
      return this.detalleConFotos(orden, this.obtenerIntervencion(id));
    })();
  }

  fallaAsociada(id: number, tecnicoId?: number): number | null {
    return this.obtener(id, tecnicoId).falla_id;
  }

  cerrar(id: number, input: OrdenCierreSolicitud, tecnicoId: number, ahora: number): OrdenDetalleRespuesta {
    const diagnostico = input.diagnostico?.trim() ?? null;
    const solucion = input.solucion.trim();
    const repuestos = input.repuestos_usados?.trim() || null;
    const consumos = [...(input.repuestos_consumidos ?? [])].sort((a, b) => a.repuesto_id - b.repuesto_id);
    if (new Set(consumos.map(consumo => consumo.repuesto_id)).size !== consumos.length) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Registra una sola cantidad por repuesto en la intervención.');
    }

    return this.datos.transaccion(() => {
      const orden = this.obtener(id, tecnicoId);
      if (orden.estado === 'CERRADA') {
        const intervencion = this.obtenerIntervencion(id);
        if (intervencion?.diagnostico === diagnostico && intervencion.solucion === solucion
          && intervencion.duracion_minutos === input.duracion_minutos && intervencion.repuestos_usados === repuestos
          && mismoConsumo(intervencion.repuestos_consumidos, consumos)) {
          return this.detalleConFotos(orden, intervencion);
        }
        throw new ErrorAPI(409, 'ORDEN_YA_CERRADA', 'La orden ya está cerrada y su intervención no puede modificarse.');
      }
      if (orden.estado !== 'EN_PROGRESO') {
        throw new ErrorAPI(409, 'TRANSICION_ORDEN_INVALIDA', 'Solo se puede cerrar una orden en progreso.');
      }

      const plan = this.datos.tenantPorId(this.datos.tenantId)?.plan;
      if (plan !== 'EMPRESA' && diagnostico !== null) {
        throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'Registrar un diagnóstico requiere el plan Empresa.');
      }
      if (plan === 'EMPRESA' && !diagnostico) {
        throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Escribe el diagnóstico de la intervención.');
      }

      const intervencion: FilaIntervencion = {
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
          (tenant_id, orden_id, autor_id, diagnostico, solucion, duracion_minutos, repuestos_usados, registrada_en)
        VALUES (@tenant_id, @orden_id, @autor_id, @diagnostico, @solucion, @duracion_minutos, @repuestos_usados, @registrada_en)
      `).run({ ...intervencion, tenant_id: this.datos.tenantId });
      const guardarConsumo = this.datos.db.prepare(`
        INSERT INTO orden_repuesto (tenant_id, orden_id, repuesto_id, codigo, nombre, cantidad)
        VALUES (@tenant_id, @orden_id, @repuesto_id, @codigo, @nombre, @cantidad)
      `);
      const repuestosConsumidos = consumos.map(consumo => {
        const repuesto = this.inventario.consumirEnTransaccion(consumo, id, tecnicoId, ahora);
        guardarConsumo.run({ orden_id: id, ...repuesto, tenant_id: this.datos.tenantId });
        return repuesto;
      });
      this.datos.db.prepare("UPDATE ordenes_trabajo SET estado = 'CERRADA' WHERE tenant_id = ? AND id = ?")
        .run(this.datos.tenantId, id);
      this.datos.auditar(tecnicoId, 'ORDEN_CERRADA_CON_INTERVENCION', id, ahora);
      return this.detalleConFotos({ ...orden, estado: 'CERRADA' }, {
        ...intervencion, repuestos_consumidos: repuestosConsumidos,
      });
    });
  }

  private detalleConFotos(orden: OrdenRespuesta, intervencion: IntervencionRespuesta | null): OrdenDetalleRespuesta {
    const fotos = orden.falla_id === null ? [] : listarFotosFalla(this.datos, orden.falla_id);
    return { ...orden, intervencion, fotos };
  }

  private obtenerIntervencion(id: number): IntervencionRespuesta | null {
    const intervencion = this.datos.db.prepare<[number, number], FilaIntervencion>(`
      SELECT orden_id, autor_id, diagnostico, solucion, duracion_minutos, repuestos_usados, registrada_en
      FROM intervenciones WHERE tenant_id = ? AND orden_id = ?
    `).get(this.datos.tenantId, id);
    if (!intervencion) return null;
    const repuestos = this.datos.db.prepare<[number, number], RepuestoConsumidoRespuesta>(`
      SELECT repuesto_id, codigo, nombre, cantidad
      FROM orden_repuesto WHERE tenant_id = ? AND orden_id = ? ORDER BY repuesto_id
    `).all(this.datos.tenantId, id);
    return { ...intervencion, repuestos_consumidos: repuestos };
  }

  private obtener(id: number, tecnicoId?: number): OrdenRespuesta {
    const filtro = ' WHERE o.tenant_id = ? AND o.id = ?' + (tecnicoId === undefined ? '' : ' AND o.tecnico_id = ?')
      + (this.datos.sedeId === null ? '' : ' AND a.sede_id = ?');
    const parametros = [this.datos.tenantId, id];
    if (tecnicoId !== undefined) parametros.push(tecnicoId);
    if (this.datos.sedeId !== null) parametros.push(this.datos.sedeId);
    const orden = this.datos.db.prepare<number[], FilaOrden>(SELECCION + filtro).get(...parametros);
    if (!orden) throw new ErrorAPI(404, 'ORDEN_NO_ENCONTRADA', 'No se encontró la orden de trabajo.');
    return ordenRespuesta(orden);
  }
}
