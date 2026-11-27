import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ruta = new URL('../.env', import.meta.url);
const ejemplo = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const contenido = ejemplo.replace(/^(JWT_SECRET|DEMO_PASSWORD_[A-Z]+)=$/gm,
  (_, nombre) => nombre + '=' + randomBytes(32).toString('hex'));
try {
  writeFileSync(ruta, contenido, { flag: 'wx', mode: 0o600 });
  console.log('Se creó .env. Consulta en ese archivo la contraseña privada de cada rol demo.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Ya existe .env. Se conservaron tus valores. Consulta .env.example para las opciones disponibles.');
}
