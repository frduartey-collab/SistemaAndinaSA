import type { Datos } from './datos.js';
import type {
  ConsultaRepuestos, MovimientoRepuestoSolicitud, PaginaRepuestos,
  RepuestoActualizarSolicitud, RepuestoConsumidoRespuesta, RepuestoConsumoSolicitud,
  RepuestoCrearSolicitud, RepuestoRespuesta,
} from './dominio.js';
import { ErrorAPI } from './errores.js';

const CAMPOS_REPUESTO = 'id, codigo, nombre, descripcion, stock_actual, stock_minimo';

export class InventarioRepuestos {
  constructor(private readonly datos: Datos) {
    this.datos.db.exec(`
      CREATE TABLE IF NOT EXISTS repuestos (
        id INTEGER PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        stock_actual INTEGER NOT NULL DEFAULT 0
          CHECK (typeof(stock_actual) = 'integer' AND stock_actual BETWEEN 0 AND 9007199254740991),
        stock_minimo INTEGER NOT NULL
          CHECK (typeof(stock_minimo) = 'integer' AND stock_minimo BETWEEN 0 AND 9007199254740991),
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS movimientos_repuestos (
        id INTEGER PRIMARY KEY,
        repuesto_id INTEGER NOT NULL REFERENCES repuestos(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        orden_id INTEGER REFERENCES intervenciones(orden_id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA')),
        cantidad INTEGER NOT NULL
          CHECK (typeof(cantidad) = 'integer' AND cantidad BETWEEN 1 AND 9007199254740991),
        motivo TEXT,
        fecha TEXT NOT NULL,
        CHECK (orden_id IS NULL OR tipo = 'SALIDA'),
        UNIQUE (repuesto_id, orden_id)
      );
    `);
  }

  listar(consulta: ConsultaRepuestos): PaginaRepuestos {
    const busqueda = consulta.q?.trim();
    const filtro = ' WHERE deleted_at IS NULL'
      + (busqueda ? ' AND (instr(lower(codigo), lower(?)) > 0 OR instr(lower(nombre), lower(?)) > 0)' : '');
    const parametros = busqueda ? [busqueda, busqueda] : [];
    const offset = (consulta.page - 1) * consulta.size;

    return this.datos.db.transaction(() => {
      const items = this.datos.db.prepare<Array<string | number>, RepuestoRespuesta>(
        'SELECT ' + CAMPOS_REPUESTO + ' FROM repuestos' + filtro + ' ORDER BY codigo LIMIT ? OFFSET ?',
      ).all(...parametros, consulta.size, offset);
      const { total } = this.datos.db.prepare<string[], { total: number }>(
        'SELECT count(*) AS total FROM repuestos' + filtro,
      ).get(...parametros)!;
      return { items, total, page: consulta.page, size: consulta.size };
    })();
  }

  obtener(id: number): RepuestoRespuesta {
    const repuesto = this.datos.db.prepare<[number], RepuestoRespuesta>(
      'SELECT ' + CAMPOS_REPUESTO + ' FROM repuestos WHERE id = ? AND deleted_at IS NULL',
    ).get(id);
    if (!repuesto) throw new ErrorAPI(404, 'REPUESTO_NO_ENCONTRADO', 'No se encontró el repuesto vigente.');
    return repuesto;
  }

  crear(input: RepuestoCrearSolicitud, actorId: number, ahora: number): RepuestoRespuesta {
    const codigo = input.codigo.toUpperCase();

    return this.datos.transaccion(() => {
      if (this.datos.db.prepare('SELECT id FROM repuestos WHERE codigo = ?').get(codigo)) {
        throw new ErrorAPI(409, 'CODIGO_DUPLICADO', 'El código del repuesto ya está reservado.');
      }
      const insercion = this.datos.db.prepare(
        'INSERT INTO repuestos(codigo, nombre, descripcion, stock_minimo) VALUES (?, ?, ?, ?)',
      ).run(codigo, input.nombre.trim(), input.descripcion?.trim() || null, input.stock_minimo);
      const id = Number(insercion.lastInsertRowid);
      this.datos.auditar(actorId, 'REPUESTO_CREADO', id, ahora);
      return this.obtener(id);
    });
  }

  actualizar(id: number, input: RepuestoActualizarSolicitud, actorId: number, ahora: number): RepuestoRespuesta {
    return this.datos.transaccion(() => {
      const actualizacion = this.datos.db.prepare(
        'UPDATE repuestos SET nombre = ?, descripcion = ?, stock_minimo = ? WHERE id = ? AND deleted_at IS NULL',
      ).run(input.nombre.trim(), input.descripcion?.trim() || null, input.stock_minimo, id);
      if (actualizacion.changes === 0) throw new ErrorAPI(404, 'REPUESTO_NO_ENCONTRADO', 'No se encontró el repuesto vigente.');
      this.datos.auditar(actorId, 'REPUESTO_MODIFICADO', id, ahora);
      return this.obtener(id);
    });
  }

  darDeBaja(id: number, actorId: number, ahora: number): void {
    this.datos.transaccion(() => {
      const repuesto = this.obtener(id);
      if (repuesto.stock_actual !== 0) {
        throw new ErrorAPI(409, 'REPUESTO_CON_STOCK', 'Registra la salida del stock restante antes de la baja.');
      }
      this.datos.db.prepare('UPDATE repuestos SET deleted_at = ? WHERE id = ?').run(new Date(ahora).toISOString(), id);
      this.datos.auditar(actorId, 'REPUESTO_BAJA_LOGICA', id, ahora);
    });
  }

  mover(id: number, input: MovimientoRepuestoSolicitud, actorId: number, ahora: number): RepuestoRespuesta {
    return this.datos.transaccion(() => this.aplicarMovimiento(id, input, actorId, ahora, null));
  }

  consumirEnTransaccion(
    consumo: RepuestoConsumoSolicitud, ordenId: number, actorId: number, ahora: number,
  ): RepuestoConsumidoRespuesta {
    if (!this.datos.db.inTransaction) throw new Error('El consumo debe registrarse dentro del cierre de la orden.');
    const { codigo, nombre } = this.aplicarMovimiento(
      consumo.repuesto_id, { tipo: 'SALIDA', cantidad: consumo.cantidad, motivo: 'Consumo por intervención' },
      actorId, ahora, ordenId,
    );
    return { ...consumo, codigo, nombre };
  }

  private aplicarMovimiento(
    id: number, input: MovimientoRepuestoSolicitud, actorId: number, ahora: number, ordenId: number | null,
  ): RepuestoRespuesta {
    const repuesto = this.obtener(id);
    const variacion = input.tipo === 'ENTRADA' ? input.cantidad : -input.cantidad;
    const stock = repuesto.stock_actual + variacion;
    if (stock < 0) {
      const mensaje = 'Stock insuficiente para ' + repuesto.nombre + ' (' + repuesto.codigo + '). Disponible: ' + repuesto.stock_actual + '.';
      throw new ErrorAPI(400, 'STOCK_INSUFICIENTE', mensaje);
    }
    if (!Number.isSafeInteger(stock)) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La entrada supera el límite de stock permitido.');
    }

    this.datos.db.prepare('UPDATE repuestos SET stock_actual = ? WHERE id = ?').run(stock, id);
    this.datos.db.prepare(
      'INSERT INTO movimientos_repuestos(repuesto_id, usuario_id, orden_id, tipo, cantidad, motivo, fecha) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, actorId, ordenId, input.tipo, input.cantidad, input.motivo?.trim() || null, new Date(ahora).toISOString());
    this.datos.auditar(actorId, 'REPUESTO_MOVIMIENTO_' + input.tipo, id, ahora);
    return { ...repuesto, stock_actual: stock };
  }
}
