import { Datos } from './datos.js';
import { rutaDatos, seed } from './db.js';
import { esquema } from './validacion.js';
import type { Rol } from './dominio.js';

const password = process.env.SEED_PASSWORD;
if (!password || password.trim().length < 16 || Buffer.byteLength(password) > 72) {
  throw new Error('Configura SEED_PASSWORD con al menos 16 caracteres y un máximo de 72 bytes.');
}
const rol = process.env.SEED_ROL ?? 'SUPERVISOR';
if (!Boolean(esquema('auth', 'Rol')(rol))) throw new Error('SEED_ROL no es un rol admitido.');
const datos = new Datos(rutaDatos());
try {
  const creado = await seed(datos.db, {
    rut: process.env.SEED_RUT ?? '11111111-1', password,
    rol: rol as Rol, nombre: 'Usuario de desarrollo',
  });
  console.log(creado ? 'Usuario inicial creado.' : 'El usuario ya existe; no se modificó.');
} finally { datos.close(); }
