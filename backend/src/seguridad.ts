import bcrypt from 'bcrypt';
import { scrypt, timingSafeEqual, createHash } from 'node:crypto';

export { rutValido } from './rut.js';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || Buffer.byteLength(password) > 72) throw new Error('bcrypt requiere contraseña de 1 a 72 bytes.');
  return bcrypt.hash(password, 12);
}

export async function verificarPassword(password: string, encoded: string): Promise<boolean> {
  if (/^\$2[aby]\$/.test(encoded)) {
    // bcrypt trunca a 72 bytes: rechazar entradas más largas evita aceptar sufijos diferentes.
    if (Buffer.byteLength(password) > 72) return false;
    return bcrypt.compare(password, encoded);
  }
  // Compatibilidad de lectura de hashes existentes; todas las altas nuevas usan bcrypt.
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3'
      || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(expected ?? '')) return false;
  const actual = await derive(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
