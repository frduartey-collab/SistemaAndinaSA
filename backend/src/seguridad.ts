import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

export function rutValido(value: string): boolean {
  if (!/^[0-9]{7,8}-[0-9Kk]$/.test(value)) return false;
  const [digits, verifier] = value.toUpperCase().split('-');
  if (Number(digits) === 0) return false;
  let sum = 0, weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const result = 11 - (sum % 11);
  return verifier === (result === 11 ? '0' : result === 10 ? 'K' : String(result));
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verificarPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3'
      || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(expected ?? '')) return false;
  const actual = await derive(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
