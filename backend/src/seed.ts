import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Datos } from './datos.js';
import { hashPassword, rutValido } from './seguridad.js';
import { esquema } from './validacion.js';
import type { Rol } from './dominio.js';

const rut = process.env.SEED_RUT ?? '12345678-5';
const password = process.env.SEED_PASSWORD ?? '';
const rol = process.env.SEED_ROL ?? 'SUPERVISOR';
if (!Boolean(esquema('auth', 'Rol')(rol))) throw new Error('SEED_ROL no es un rol admitido.');
if (!rutValido(rut) || password.length < 12) throw new Error('Configura SEED_RUT válido y SEED_PASSWORD de al menos 12 caracteres.');
const path = resolve(process.env.DB_PATH ?? 'backend/data/andina.sqlite');
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const datos = new Datos(path);
try {
  if (datos.usuarioPorRut(rut)) throw new Error('El usuario ya existe; no se sobrescribió.');
  datos.crearUsuario({ rut, nombre: 'Usuario de desarrollo', rol: rol as Rol, activo: true, passwordHash: await hashPassword(password) });
  console.log('Usuario de desarrollo creado con rol ' + rol + '. No se imprime la contraseña.');
} finally { datos.close(); }
