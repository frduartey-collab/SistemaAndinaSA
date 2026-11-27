import { randomBytes } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAplicacion } from './app.js';
import { rutaDatos } from './db.js';
import { sembrarDemo } from './demo.js';
import { Datos } from './datos.js';

const produccion = process.env.NODE_ENV === 'production';
const webUnificada = produccion || process.argv.includes('--web');
const frontendDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
const path = rutaDatos();
const uploadsDir = resolve(process.env.UPLOADS_DIR || fileURLToPath(new URL('../data/uploads', import.meta.url)));
for (const archivoPrivado of [path, uploadsDir]) {
  const ruta = relative(frontendDir, archivoPrivado);
  if (ruta !== '..' && !ruta.startsWith('..' + sep) && !isAbsolute(ruta)) {
    throw new Error('Los datos privados deben quedar fuera del directorio público del frontend.');
  }
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
const host = produccion ? '0.0.0.0' : '127.0.0.1';
const secret = process.env.JWT_SECRET || (produccion ? '' : randomBytes(32).toString('hex'));
if (Buffer.byteLength(secret) < 32) throw new Error('Configura JWT_SECRET con al menos 32 bytes antes de iniciar.');
const backend = await crearAplicacion({
  secret,
  datos: new Datos(path),
  frontendDir: webUnificada ? frontendDir : undefined,
  uploadsDir,
  proxyRender: produccion && process.env.RENDER === 'true',
  pagosSimulados: process.env.SIGEM_PAGOS_SIMULADOS === '1',
  pagoWebhookSecret: process.env.SIGEM_WEBHOOK_PAGO_SECRET,
});
await sembrarDemo(backend.datos.db);
const server = backend.app.listen(port, host, () => console.log(`Andina API: http://${host}:${port}`));
function evaluarPreventivos(): void {
  backend.evaluarPreventivosProgramados((tenantId, error) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error('La evaluación preventiva falló para la empresa ' + tenantId + '. ' + mensaje);
  });
}
evaluarPreventivos();
const programadorPreventivos = setInterval(evaluarPreventivos, 60_000).unref();
function close(): void {
  clearInterval(programadorPreventivos);
  server.close(() => { backend.close(); process.exit(0); });
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
