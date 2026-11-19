import type { Datos } from './datos.js';
import type {
  ConsultaFallas, ConsultaNotificaciones, FallaCrearSolicitud, FallaDetalleRespuesta, FallaRespuesta,
  FotoFallaResumen, FotoFallaSolicitud, NotificacionFalla, PaginaFallas, PaginaNotificaciones, TipoFotoFalla,
} from './dominio.js';
import { ErrorAPI } from './errores.js';

interface FotoFallaBinaria { tipo: TipoFotoFalla; contenido: Buffer }
type FilaNotificacion = Omit<NotificacionFalla, 'leida'> & { leida: number };

const MAX_BYTES_FOTO = 5 * 1024 * 1024;
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_RIFF = Buffer.from('RIFF');
const FIRMA_WEBP = Buffer.from('WEBP');

function coincideFirma(tipo: TipoFotoFalla, contenido: Buffer): boolean {
  switch (tipo) {
    case 'image/jpeg':
      return contenido.subarray(0, FIRMA_JPEG.length).equals(FIRMA_JPEG);
    case 'image/png':
      return contenido.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG);
    case 'image/webp':
      return contenido.subarray(0, 4).equals(FIRMA_RIFF) && contenido.subarray(8, 12).equals(FIRMA_WEBP);
  }
}

function decodificarFoto(foto: FotoFallaSolicitud, posicion: number): FotoFallaBinaria & { nombre: string } {
  const contenido = Buffer.from(foto.contenido_base64, 'base64');
  const prefijo = 'Foto ' + (posicion + 1) + '. ';
  if (contenido.length > MAX_BYTES_FOTO) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', prefijo + 'El tamaño máximo es 5 MiB.');
  }
  if (contenido.length === 0 || contenido.toString('base64') !== foto.contenido_base64) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', prefijo + 'El contenido debe estar en base64 canónico.');
  }
  if (!coincideFirma(foto.tipo, contenido)) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', prefijo + 'Los bytes no coinciden con el tipo de imagen indicado.');
  }
  return { nombre: foto.nombre.trim(), tipo: foto.tipo, contenido };
}

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
      CREATE TABLE IF NOT EXISTS fotos_falla (
        id INTEGER PRIMARY KEY,
        falla_id INTEGER NOT NULL REFERENCES fallas(id),
        nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 180),
        tipo TEXT NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp')),
        contenido BLOB NOT NULL
          CHECK (typeof(contenido) = 'blob' AND length(contenido) BETWEEN 3 AND ${MAX_BYTES_FOTO})
      );
      CREATE INDEX IF NOT EXISTS fotos_por_falla ON fotos_falla(falla_id, id);
      CREATE TABLE IF NOT EXISTS notificaciones_falla (
        id INTEGER PRIMARY KEY,
        falla_id INTEGER NOT NULL REFERENCES fallas(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        fecha TEXT NOT NULL,
        leida_en TEXT,
        UNIQUE (falla_id, usuario_id)
      );
      CREATE INDEX IF NOT EXISTS notificaciones_por_usuario
        ON notificaciones_falla(usuario_id, fecha DESC, id DESC);
    `);
  }

  crear(input: FallaCrearSolicitud, usuarioId: number, ahora: number): FallaRespuesta {
    const fotos = (input.fotos ?? []).map(decodificarFoto);
    return this.datos.transaccion(() => {
      const equipo = this.datos.obtener(input.equipo_id);
      const fecha = new Date(ahora).toISOString();
      const { lastInsertRowid } = this.datos.db.prepare(`
        INSERT INTO fallas(equipo_id, usuario_id, descripcion, prioridad, fecha_reporte)
        VALUES (?, ?, ?, ?, ?)
      `).run(equipo.id, usuarioId, input.descripcion.trim(), input.prioridad ?? equipo.criticidad, fecha);

      const id = Number(lastInsertRowid);
      const insertarFoto = this.datos.db.prepare(
        'INSERT INTO fotos_falla(falla_id, nombre, tipo, contenido) VALUES (?, ?, ?, ?)',
      );
      for (const foto of fotos) {
        insertarFoto.run(id, foto.nombre, foto.tipo, foto.contenido);
      }
      this.datos.db.prepare(`
        INSERT INTO notificaciones_falla(falla_id, usuario_id, fecha)
        SELECT ?, id, ? FROM usuarios WHERE activo = 1 AND rol IN ('SUPERVISOR', 'JEFATURA')
      `).run(id, fecha);
      this.datos.auditar(usuarioId, 'FALLA_REPORTADA', id, ahora);
      return this.obtener(id);
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

  detalle(id: number, usuarioId?: number): FallaDetalleRespuesta {
    return this.datos.db.transaction(() => {
      const falla = this.obtener(id, usuarioId);
      const fotos = this.datos.db.prepare<[number], FotoFallaResumen>(
        'SELECT id, nombre, tipo FROM fotos_falla WHERE falla_id = ? ORDER BY id',
      ).all(id);
      return { ...falla, fotos };
    })();
  }

  foto(id: number, fotoId: number, usuarioId?: number): FotoFallaBinaria {
    const filtro = usuarioId === undefined ? '' : ' AND f.usuario_id = ?';
    const parametros = usuarioId === undefined ? [id, fotoId] : [id, fotoId, usuarioId];
    const foto = this.datos.db.prepare<number[], FotoFallaBinaria>(`
      SELECT ff.tipo, ff.contenido
      FROM fotos_falla ff
      JOIN fallas f ON f.id = ff.falla_id
      WHERE f.id = ? AND ff.id = ?${filtro}
    `).get(...parametros);
    if (!foto) throw new ErrorAPI(404, 'FOTO_NO_ENCONTRADA', 'No se encontró la foto.');
    return foto;
  }

  listarNotificaciones(consulta: ConsultaNotificaciones, usuarioId: number): PaginaNotificaciones {
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      const filas = this.datos.db.prepare<[number, number, number], FilaNotificacion>(`
        SELECT n.id, n.falla_id, a.codigo AS equipo_codigo, a.nombre AS equipo_nombre,
               n.fecha, n.leida_en IS NOT NULL AS leida
        FROM notificaciones_falla n
        JOIN fallas f ON f.id = n.falla_id
        JOIN activos a ON a.id = f.equipo_id
        WHERE n.usuario_id = ? ORDER BY n.fecha DESC, n.id DESC LIMIT ? OFFSET ?
      `).all(usuarioId, consulta.size, offset);
      const { total } = this.datos.db.prepare<[number], { total: number }>(
        'SELECT count(*) AS total FROM notificaciones_falla WHERE usuario_id = ?',
      ).get(usuarioId)!;
      const items = filas.map(fila => ({ ...fila, leida: Boolean(fila.leida) }));
      return { ...consulta, items, total };
    })();
  }

  leerNotificacion(id: number, usuarioId: number, ahora: number): void {
    const resultado = this.datos.db.prepare(`
      UPDATE notificaciones_falla SET leida_en = coalesce(leida_en, ?) WHERE id = ? AND usuario_id = ?
    `).run(new Date(ahora).toISOString(), id, usuarioId);
    if (resultado.changes === 0) {
      throw new ErrorAPI(404, 'NOTIFICACION_NO_ENCONTRADA', 'No se encontró la notificación.');
    }
  }

  private obtener(id: number, usuarioId?: number): FallaRespuesta {
    const filtro = usuarioId === undefined ? '' : ' AND f.usuario_id = ?';
    const parametros = usuarioId === undefined ? [id] : [id, usuarioId];
    const falla = this.datos.db.prepare<number[], FallaRespuesta>(
      SELECCION_FALLAS + ' WHERE f.id = ?' + filtro,
    ).get(...parametros);
    if (!falla) throw new ErrorAPI(404, 'FALLA_NO_ENCONTRADA', 'No se encontró la falla.');
    return falla;
  }
}
