import { AsyncLocalStorage } from 'node:async_hooks';
import type Database from 'better-sqlite3';
import { abrirConexion } from './db.js';
import type {
  UsuarioSesion, ActivoRespuesta, ActivoCrearSolicitud, ActivoActualizarSolicitud, ConsultaActivos, PaginaActivos,
  PlanTenant, Tenant,
} from './dominio.js';
import { ErrorAPI } from './errores.js';
import { migrarTenantsBase, migrarTenantsOperativos, TENANT_LEGADO_ID } from './tenants.js';

export interface UsuarioRegistro extends UsuarioSesion { passwordHash: string }
type UsuarioNuevo = Pick<UsuarioRegistro, 'rut' | 'nombre' | 'rol' | 'activo' | 'passwordHash'>;
type Row = Record<string, unknown>;
const SELECCION_USUARIO = 'SELECT u.*, t.plan FROM usuarios u JOIN tenants t ON t.id = u.tenant_id';

function usuario(row: Row): UsuarioRegistro {
  return { id: Number(row.id), rut: String(row.rut), nombre: String(row.nombre),
    rol: row.rol as UsuarioSesion['rol'], activo: Boolean(row.activo), passwordHash: String(row.password_hash),
    tenant_id: Number(row.tenant_id), plan: row.plan as PlanTenant };
}
function activo(row: Row): ActivoRespuesta {
  return { id: Number(row.id), codigo: row.codigo as ActivoRespuesta['codigo'], nombre: String(row.nombre),
    marca: row.marca === null ? null : String(row.marca), modelo: row.modelo === null ? null : String(row.modelo),
    ubicacion: String(row.ubicacion), criticidad: row.criticidad as ActivoRespuesta['criticidad'],
    estado: row.estado as ActivoRespuesta['estado'], uso_acumulado_horas: Number(row.uso_acumulado_horas),
    fecha_alta: String(row.fecha_alta), deleted_at: row.deleted_at === null ? null : String(row.deleted_at),
    ...(typeof row.sede_id === 'number' ? { sede_id: row.sede_id } : {}) };
}

export class Datos {
  readonly db: Database.Database;
  private readonly tenantContexto = new AsyncLocalStorage<number>();

  constructor(path = ':memory:') {
    this.db = abrirConexion(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS sesiones (
        id TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        token_hash TEXT NOT NULL UNIQUE, expira_en INTEGER NOT NULL, revocada INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS intentos_login (
        origen TEXT PRIMARY KEY, cantidad INTEGER NOT NULL, vence INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES usuarios(id), accion TEXT NOT NULL,
        entidad_id INTEGER, fecha TEXT NOT NULL
      );
    `);
    this.migrarActivos();
    migrarTenantsBase(this.db);
  }

  get tenantId(): number { return this.tenantContexto.getStore() ?? TENANT_LEGADO_ID; }
  enTenant<T>(id: number, ejecutar: () => T): T { return this.tenantContexto.run(id, ejecutar); }
  migrarTenantsOperativos(): void { migrarTenantsOperativos(this.db); }

  tenantPorId(id: number): Tenant | undefined {
    return this.db.prepare<[number], Tenant>(
      'SELECT id, nombre_empresa, plan, fecha_suscripcion, estado FROM tenants WHERE id=?',
    ).get(id);
  }

  crearTenant(nombre: string, plan: PlanTenant, ahora: number): Tenant {
    const fecha_suscripcion = new Date(ahora).toISOString();
    const nombre_empresa = nombre.trim();
    const resultado = this.db.prepare(
      'INSERT INTO tenants(nombre_empresa,plan,fecha_suscripcion) VALUES(?,?,?)',
    ).run(nombre_empresa, plan, fecha_suscripcion);
    return { id: Number(resultado.lastInsertRowid), nombre_empresa, plan, fecha_suscripcion, estado: 'ACTIVO' };
  }

  close(): void { this.db.close(); }
  transaccion<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = run(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  auditar(actor: number | null, accion: string, entidad: number | null, now: number): void {
    this.db.prepare('INSERT INTO auditoria(actor_id,accion,entidad_id,fecha,tenant_id) VALUES(?,?,?,?,?)')
      .run(actor, accion, entidad, new Date(now).toISOString(), this.tenantId);
  }
  crearUsuario(input: UsuarioNuevo): UsuarioRegistro {
    const result = this.db.prepare('INSERT INTO usuarios(rut,nombre,rol,activo,password_hash,tenant_id) VALUES(?,?,?,?,?,?)')
      .run(input.rut.toUpperCase(), input.nombre, input.rol, input.activo ? 1 : 0, input.passwordHash, this.tenantId);
    return this.usuarioPorId(Number(result.lastInsertRowid))!;
  }
  usuarioPorRut(rut: string): UsuarioRegistro | undefined {
    const row = this.db.prepare<[string], Row>(SELECCION_USUARIO + ' WHERE u.rut=?').get(rut.toUpperCase());
    return row ? usuario(row) : undefined;
  }
  usuarioPorIdGlobal(id: number): UsuarioRegistro | undefined {
    const row = this.db.prepare<[number], Row>(SELECCION_USUARIO + ' WHERE u.id=?').get(id);
    return row ? usuario(row) : undefined;
  }
  usuarioPorId(id: number): UsuarioRegistro | undefined {
    const row = this.db.prepare<[number, number], Row>(SELECCION_USUARIO + ' WHERE u.id=? AND u.tenant_id=?').get(id, this.tenantId);
    return row ? usuario(row) : undefined;
  }
  actualizarPassword(id: number, hash: string): void {
    this.db.prepare('UPDATE usuarios SET password_hash=? WHERE id=? AND tenant_id=?').run(hash, id, this.tenantId);
  }
  sesion(id: string): Row | undefined { return this.db.prepare<unknown[], Row>('SELECT * FROM sesiones WHERE id=?').get(id); }
  crearSesion(id: string, usuarioId: number, hash: string, vence: number): void {
    this.db.prepare('INSERT INTO sesiones(id,usuario_id,token_hash,expira_en,tenant_id) VALUES(?,?,?,?,?)')
      .run(id, usuarioId, hash, vence, this.tenantId);
  }
  revocar(id: string): void {
    this.db.prepare('UPDATE sesiones SET revocada=1 WHERE id=? AND tenant_id=?').run(id, this.tenantId);
  }
  intentos(origen: string, now: number): number {
    const row = this.db.prepare<unknown[], Row>('SELECT * FROM intentos_login WHERE origen=? AND vence>?').get(origen, now);
    return row ? Number(row.cantidad) : 0;
  }
  reintentarEn(origen: string, now: number): number {
    const row = this.db.prepare<unknown[], Row>('SELECT vence FROM intentos_login WHERE origen=?').get(origen);
    return row ? Math.max(1, Math.ceil((Number(row.vence) - now) / 1000)) : 1;
  }
  fallarLogin(origen: string, now: number, window: number): number {
    this.db.prepare<unknown[], Row>('DELETE FROM intentos_login WHERE vence<=?').run(now);
    this.db.prepare<unknown[], Row>(`INSERT INTO intentos_login(origen,cantidad,vence) VALUES(?,1,?)
      ON CONFLICT(origen) DO UPDATE SET cantidad=cantidad+1`).run(origen, now + window);
    return this.intentos(origen, now);
  }
  limpiarIntentos(origen: string): void { this.db.prepare<unknown[], Row>('DELETE FROM intentos_login WHERE origen=?').run(origen); }
  /** Migración transaccional de la versión anterior, sin borrar datos legados. */
  private migrarActivos(): void {
    this.transaccion(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migraciones (
          version INTEGER PRIMARY KEY, aplicada_en TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activos (
          id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL,
          nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 120),
          marca TEXT CHECK(marca IS NULL OR length(marca)<=120),
          modelo TEXT CHECK(modelo IS NULL OR length(modelo)<=120),
          ubicacion TEXT NOT NULL CHECK(length(trim(ubicacion)) BETWEEN 1 AND 120),
          criticidad TEXT NOT NULL CHECK(criticidad IN ('ALTA','MEDIA','BAJA')),
          estado TEXT NOT NULL CHECK(estado IN ('OPERATIVO','EN_FALLA','EN_MANTENCIÓN','FUERA_DE_SERVICIO')),
          uso_acumulado_horas REAL NOT NULL DEFAULT 0 CHECK(uso_acumulado_horas>=0),
          fecha_alta TEXT NOT NULL, deleted_at TEXT,
          CHECK(length(codigo)=7 AND codigo GLOB 'EQ-[0-9][0-9][0-9][0-9]')
        );
      `);
      if (this.db.prepare<unknown[], Row>('SELECT version FROM migraciones WHERE version=1').get()) return;
      const legado = this.db.prepare<unknown[], Row>("SELECT name FROM sqlite_master WHERE type='table' AND name='equipos'").get();
      if (legado) {
        // Conserva IDs para que auditoria.entidad_id siga identificando el mismo activo.
        this.db.exec(`INSERT INTO activos(id,codigo,nombre,marca,modelo,ubicacion,criticidad,estado,
            uso_acumulado_horas,fecha_alta,deleted_at)
          SELECT id,codigo,nombre,NULL,NULL,ubicacion,criticidad,
            CASE WHEN eliminado_en IS NOT NULL THEN 'FUERA_DE_SERVICIO' ELSE estado END,
            0,creado_en,eliminado_en FROM equipos`);
      }
      this.db.prepare<unknown[], Row>('INSERT INTO migraciones(version,aplicada_en) VALUES(1,?)').run(new Date().toISOString());
    });
  }
  listar(query: ConsultaActivos): PaginaActivos {
    const where = ['tenant_id=?', 'deleted_at IS NULL'];
    const params: Array<string | number> = [this.tenantId];
    const q = query.q?.trim();
    if (q) {
      // instr busca una subcadena literal: % y _ no se convierten en comodines SQL.
      where.push('(instr(lower(codigo),lower(?))>0 OR instr(lower(nombre),lower(?))>0)');
      params.push(q, q);
    }
    if (query.criticidad) { where.push('criticidad=?'); params.push(query.criticidad); }
    if (query.estado) { where.push('estado=?'); params.push(query.estado); }
    const filter = where.join(' AND ');
    const rows = this.db.prepare<unknown[], Row>('SELECT * FROM activos WHERE ' + filter + ' ORDER BY id LIMIT ? OFFSET ?')
      .all(...params, query.size, (query.page - 1) * query.size);
    const count = this.db.prepare<unknown[], Row>('SELECT count(*) AS total FROM activos WHERE ' + filter).get(...params)!;
    return { items: rows.map(activo), total: Number(count.total), page: query.page, size: query.size };
  }
  obtener(id: number): ActivoRespuesta {
    const row = this.db.prepare<[number, number], Row>(
      'SELECT * FROM activos WHERE id=? AND tenant_id=? AND deleted_at IS NULL',
    ).get(id, this.tenantId);
    if (!row) throw new ErrorAPI(404, 'ACTIVO_NO_ENCONTRADO', 'El activo no existe o fue dado de baja.');
    return activo(row);
  }
  private codigoLibre(codigo: string): void {
    if (this.db.prepare('SELECT id FROM activos WHERE codigo=? AND tenant_id=?').get(codigo, this.tenantId)) {
      throw new ErrorAPI(409, 'CODIGO_DUPLICADO', 'El código ya está reservado.');
    }
  }
  private validarSede(sedeId: number | null, plan: PlanTenant | undefined): void {
    if (sedeId === null) return;
    if (plan !== 'EMPRESA') {
      throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'Asignar una sede requiere el plan Empresa.');
    }
    if (!this.db.prepare('SELECT id FROM sedes WHERE id=? AND tenant_id=?').get(sedeId, this.tenantId)) {
      throw new ErrorAPI(404, 'SEDE_NO_ENCONTRADA', 'No se encontró la sede.');
    }
  }
  crear(input: ActivoCrearSolicitud, actor: number, now: number): ActivoRespuesta {
    return this.transaccion(() => {
      this.codigoLibre(input.codigo);
      const plan = this.tenantPorId(this.tenantId)?.plan;
      const sede = input.sede_id ?? null;
      this.validarSede(sede, plan);
      if (plan === 'PARTICULAR') {
        const { total } = this.db.prepare<[number], { total: number }>(
          'SELECT count(*) AS total FROM activos WHERE tenant_id=? AND deleted_at IS NULL',
        ).get(this.tenantId)!;
        if (total >= 50) {
          throw new ErrorAPI(403, 'CUPO_EQUIPOS_ALCANZADO', 'El plan Particular admite hasta 50 equipos vigentes.');
        }
      }
      const result = this.db.prepare<unknown[], Row>(`INSERT INTO activos(codigo,nombre,marca,modelo,ubicacion,criticidad,
          estado,uso_acumulado_horas,fecha_alta,sede_id,tenant_id) VALUES(?,?,?,?,?,?,'OPERATIVO',0,?,?,?)`)
        .run(input.codigo, input.nombre.trim(), input.marca?.trim() ?? null, input.modelo?.trim() ?? null,
          input.ubicacion.trim(), input.criticidad, new Date(now).toISOString(), sede, this.tenantId);
      const id = Number(result.lastInsertRowid);
      this.auditar(actor, 'ACTIVO_CREADO', id, now);
      return this.obtener(id);
    });
  }
  modificar(id: number, input: ActivoActualizarSolicitud, actor: number, now: number): ActivoRespuesta {
    return this.transaccion(() => {
      const current = this.obtener(id);
      // Lista explícita: codigo, estado y fechas no se toman del cuerpo HTTP.
      const nombre = input.nombre ?? current.nombre;
      const marca = input.marca === undefined ? current.marca : input.marca;
      const modelo = input.modelo === undefined ? current.modelo : input.modelo;
      const ubicacion = input.ubicacion ?? current.ubicacion;
      const criticidad = input.criticidad ?? current.criticidad;
      const uso = input.uso_acumulado_horas ?? current.uso_acumulado_horas;
      const sede = input.sede_id === undefined ? current.sede_id ?? null : input.sede_id;
      if (input.sede_id !== undefined) this.validarSede(sede, this.tenantPorId(this.tenantId)?.plan);
      this.db.prepare(`UPDATE activos SET nombre=?,marca=?,modelo=?,ubicacion=?,criticidad=?,uso_acumulado_horas=?,sede_id=?
        WHERE id=? AND tenant_id=?`)
        .run(nombre.trim(), marca?.trim() ?? null, modelo?.trim() ?? null, ubicacion.trim(), criticidad, uso, sede, id, this.tenantId);
      this.auditar(actor, 'ACTIVO_MODIFICADO', id, now);
      return this.obtener(id);
    });
  }
  eliminar(id: number, actor: number, now: number): void {
    this.transaccion(() => {
      this.obtener(id);
      this.db.prepare("UPDATE activos SET deleted_at=?,estado='FUERA_DE_SERVICIO' WHERE id=? AND tenant_id=?")
        .run(new Date(now).toISOString(), id, this.tenantId);
      this.auditar(actor, 'ACTIVO_BAJA_LOGICA', id, now);
    });
  }
}
