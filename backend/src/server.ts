import { crearAplicacion } from './app.js';
import { rutaDatos, seed } from './db.js';
import { Datos } from './datos.js';

const secret = process.env.JWT_SECRET ?? '';
if (Buffer.byteLength(secret) < 32) throw new Error('Configura JWT_SECRET con al menos 32 bytes antes de iniciar.');
const path = rutaDatos();
const backend = await crearAplicacion({
  secret,
  datos: new Datos(path),
  pagosSimulados: process.env.SIGEM_PAGOS_SIMULADOS === '1',
  pagoWebhookSecret: process.env.SIGEM_WEBHOOK_PAGO_SECRET,
});
await seed(backend.datos.db);
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
const server = backend.app.listen(port, '127.0.0.1', () => console.log(`Andina API: http://127.0.0.1:${port}`));
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
