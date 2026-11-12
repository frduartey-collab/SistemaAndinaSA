import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import type { UsuarioSesion, EquipoRespuesta, EquipoCrearSolicitud, EquipoActualizarSolicitud } from './dominio.js';
import { ErrorAPI } from './errores.js';

export interface UsuarioRegistro extends UsuarioSesion { passwordHash: string }
type Row = Record<string, unknown>;

function usuario(row: Row): UsuarioRegistro {
  return { id: Number(row.id), rut: String(row.rut), nombre: String(row.nombre),
    rol: row.rol as UsuarioSesion['rol'], activo: Boolean(row.activo), passwordHash: String(row.password_hash) };
}
function equipo(row: Row): EquipoRespuesta {
  return { id: Number(row.id), codigo: row.codigo as EquipoRespuesta['codigo'], nombre: String(row.nombre),
    ubicacion: String(row.ubicacion), criticidad: row.criticidad as EquipoRespuesta['criticidad'],
    estado: row.estado as EquipoRespuesta['estado'], creadoEn: String(row.creado_en),
    actualizadoEn: String(row.actualizado_en), eliminadoEn: row.eliminado_en === null ? null : String(row.eliminado_en) };
}

export class Datos {
  readonly db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY, rut TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL,
        rol TEXT NOT NULL CHECK(rol IN ('TECNICO','SUPERVISOR','TRABAJADOR','BODEGA','JEFATURA')),
        activo INTEGER NOT NULL CHECK(activo IN (0,1)), password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sesiones (
        id TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        token_hash TEXT NOT NULL UNIQUE, expira_en INTEGER NOT NULL, revocada INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS intentos_login (
        origen TEXT PRIMARY KEY, cantidad INTEGER NOT NULL, vence INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS equipos (
        id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 120),
        ubicacion TEXT NOT NULL CHECK(length(trim(ubicacion)) BETWEEN 1 AND 120),
        criticidad TEXT NOT NULL CHECK(criticidad IN ('ALTA','MEDIA','BAJA')),
        estado TEXT NOT NULL CHECK(estado IN ('OPERATIVO','EN_FALLA','EN_MANTENCIÓN','FUERA_DE_SERVICIO')),
        creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT,
        CHECK(length(codigo)=7 AND codigo GLOB 'EQ-[0-9][0-9][0-9][0-9]')
      );
      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES usuarios(id), accion TEXT NOT NULL,
        entidad_id INTEGER, fecha TEXT NOT NULL
      );
    `);
  }
  close(): void { this.db.close(); }
  transaccion<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = run(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  auditar(actor: number | null, accion: string, entidad: number | null, now: number): void {
    this.db.prepare('INSERT INTO auditoria(actor_id,accion,entidad_id,fecha) VALUES(?,?,?,?)')
      .run(actor, accion, entidad, new Date(now).toISOString());
  }
  crearUsuario(input: Omit<UsuarioRegistro, 'id'>): UsuarioRegistro {
    const result = this.db.prepare('INSERT INTO usuarios(rut,nombre,rol,activo,password_hash) VALUES(?,?,?,?,?)')
      .run(input.rut.toUpperCase(), input.nombre, input.rol, input.activo ? 1 : 0, input.passwordHash);
    return this.usuarioPorId(Number(result.lastInsertRowid))!;
  }
  usuarioPorRut(rut: string): UsuarioRegistro | undefined {
    const row = this.db.prepare('SELECT * FROM usuarios WHERE rut=?').get(rut.toUpperCase());
    return row ? usuario(row) : undefined;
  }
  usuarioPorId(id: number): UsuarioRegistro | undefined {
    const row = this.db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
    return row ? usuario(row) : undefined;
  }
  sesion(id: string): Row | undefined { return this.db.prepare('SELECT * FROM sesiones WHERE id=?').get(id); }
  crearSesion(id: string, usuarioId: number, hash: string, vence: number): void {
    this.db.prepare('INSERT INTO sesiones(id,usuario_id,token_hash,expira_en) VALUES(?,?,?,?)').run(id, usuarioId, hash, vence);
  }
  revocar(id: string): void { this.db.prepare('UPDATE sesiones SET revocada=1 WHERE id=?').run(id); }
  intentos(origen: string, now: number): number {
    const row = this.db.prepare('SELECT * FROM intentos_login WHERE origen=? AND vence>?').get(origen, now);
    return row ? Number(row.cantidad) : 0;
  }
  reintentarEn(origen: string, now: number): number {
    const row = this.db.prepare('SELECT vence FROM intentos_login WHERE origen=?').get(origen);
    return row ? Math.max(1, Math.ceil((Number(row.vence) - now) / 1000)) : 1;
  }
  fallarLogin(origen: string, now: number, window: number): number {
    this.db.prepare('DELETE FROM intentos_login WHERE vence<=?').run(now);
    this.db.prepare(`INSERT INTO intentos_login(origen,cantidad,vence) VALUES(?,1,?)
      ON CONFLICT(origen) DO UPDATE SET cantidad=cantidad+1`).run(origen, now + window);
    return this.intentos(origen, now);
  }
  limpiarIntentos(origen: string): void { this.db.prepare('DELETE FROM intentos_login WHERE origen=?').run(origen); }
  listar(limit: number, offset: number): { items: EquipoRespuesta[]; total: number } {
    const rows = this.db.prepare('SELECT * FROM equipos WHERE eliminado_en IS NULL ORDER BY id LIMIT ? OFFSET ?').all(limit, offset);
    const count = this.db.prepare('SELECT count(*) AS total FROM equipos WHERE eliminado_en IS NULL').get()!;
    return { items: rows.map(equipo), total: Number(count.total) };
  }
  obtener(id: number): EquipoRespuesta {
    const row = this.db.prepare('SELECT * FROM equipos WHERE id=? AND eliminado_en IS NULL').get(id);
    if (!row) throw new ErrorAPI(404, 'EQUIPO_NO_ENCONTRADO', 'El equipo no existe o fue dado de baja.');
    return equipo(row);
  }
  private codigoLibre(codigo: string, except?: number): void {
    const row = this.db.prepare('SELECT id FROM equipos WHERE codigo=?').get(codigo);
    if (row && Number(row.id) !== except) throw new ErrorAPI(409, 'CODIGO_DUPLICADO', 'El código ya está reservado.');
  }
  crear(input: EquipoCrearSolicitud, actor: number, now: number): EquipoRespuesta {
    return this.transaccion(() => {
      this.codigoLibre(input.codigo);
      const date = new Date(now).toISOString();
      const result = this.db.prepare(`INSERT INTO equipos(codigo,nombre,ubicacion,criticidad,estado,creado_en,actualizado_en)
        VALUES(?,?,?,?,?,?,?)`).run(input.codigo, input.nombre.trim(), input.ubicacion.trim(), input.criticidad, input.estado ?? 'OPERATIVO', date, date);
      const id = Number(result.lastInsertRowid);
      this.auditar(actor, 'EQUIPO_CREADO', id, now);
      return this.obtener(id);
    });
  }
  modificar(id: number, input: EquipoActualizarSolicitud, actor: number, now: number): EquipoRespuesta {
    return this.transaccion(() => {
      const current = this.obtener(id);
      const merged = { ...current, ...input };
      this.codigoLibre(merged.codigo, id);
      this.db.prepare('UPDATE equipos SET codigo=?,nombre=?,ubicacion=?,criticidad=?,estado=?,actualizado_en=? WHERE id=?')
        .run(merged.codigo, merged.nombre.trim(), merged.ubicacion.trim(), merged.criticidad, merged.estado, new Date(now).toISOString(), id);
      this.auditar(actor, 'EQUIPO_MODIFICADO', id, now);
      return this.obtener(id);
    });
  }
  eliminar(id: number, actor: number, now: number): void {
    this.transaccion(() => {
      this.obtener(id);
      const date = new Date(now).toISOString();
      this.db.prepare('UPDATE equipos SET eliminado_en=?,actualizado_en=? WHERE id=?').run(date, date, id);
      this.auditar(actor, 'EQUIPO_BAJA_LOGICA', id, now);
    });
  }
}
