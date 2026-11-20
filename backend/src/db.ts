import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, rutValido } from './seguridad.js';
import type { Rol } from './dominio.js';
import { prepararTenants } from './tenants.js';

export function rutaDatos(): string {
  return resolve(process.env.DB_PATH ?? fileURLToPath(new URL('../data/app.db', import.meta.url)));
}

export function abrirConexion(path = rutaDatos()): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  prepararTenants(db);
  db.exec(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, rut TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('TECNICO','SUPERVISOR','TRABAJADOR','BODEGA','JEFATURA')),
    activo INTEGER NOT NULL CHECK(activo IN (0,1))
  )`);
  return db;
}

interface UsuarioInicial { rut: string; password: string; nombre: string; rol: Rol }
const inicial: UsuarioInicial = { rut: '11111111-1', password: 'admin123', nombre: 'Supervisor', rol: 'SUPERVISOR' };

/** Seed local solicitado: nunca cambia la contraseña ni el rol de un usuario existente. */
export async function seed(db: Database.Database, input: UsuarioInicial = inicial): Promise<boolean> {
  if (!rutValido(input.rut) || !input.password || Buffer.byteLength(input.password) > 72) {
    throw new Error('El seed requiere RUT válido y contraseña de 1 a 72 bytes.');
  }
  const rut = input.rut.toUpperCase();
  if (db.prepare('SELECT id FROM usuarios WHERE rut=?').get(rut)) return false;
  const hash = await hashPassword(input.password);
  return db.prepare(`INSERT INTO usuarios(rut,nombre,password_hash,rol,activo) VALUES(?,?,?,?,1)
    ON CONFLICT(rut) DO NOTHING`).run(rut, input.nombre, hash, input.rol).changes > 0;
}
