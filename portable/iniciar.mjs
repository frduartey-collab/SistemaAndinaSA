import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const app = join(root, 'app');
const local = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA || homedir(), 'SIGEM')
  : join(homedir(), 'Library', 'Application Support', 'SIGEM');
mkdirSync(local, { recursive: true, mode: 0o700 });
const config = join(local, 'credenciales-demo.json');
if (!existsSync(config)) {
  const claves = Object.fromEntries(['SUPERVISOR', 'TECNICO', 'TRABAJADOR', 'BODEGA', 'JEFATURA']
    .map(rol => [rol, randomBytes(18).toString('hex')]));
  try {
    writeFileSync(config, JSON.stringify({ jwt: randomBytes(32).toString('hex'), claves }, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
const { jwt, claves } = JSON.parse(readFileSync(config, 'utf8'));
const original = join(homedir(), 'Desktop', 'ProyectoAndinaSA', 'backend', 'data');
const legacy = join(original, 'andina.sqlite');
const env = {
  ...process.env, NODE_ENV: 'development', JWT_SECRET: jwt,
  DB_PATH: existsSync(legacy) ? legacy : join(local, 'sigem.sqlite'),
  UPLOADS_DIR: existsSync(legacy) ? join(original, 'uploads') : join(local, 'uploads'),
};
for (const [rol, clave] of Object.entries(claves)) env['DEMO_PASSWORD_' + rol] = clave;
const probe = createServer();
probe.listen(0, '127.0.0.1', () => {
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo obtener un puerto local.');
  const port = address.port;
  probe.close(() => {
    env.PORT = String(port);
    const server = spawn(process.execPath, [join(app, 'backend', 'dist', 'server.js'), '--web'], {
      cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let errors = '';
    server.stderr.on('data', chunk => { errors += chunk.toString(); });
    server.stdout.on('data', chunk => {
      if (!chunk.toString().includes('Andina API:')) return;
      const url = 'http://127.0.0.1:' + port;
      console.log('SIGEM_LISTO=' + port);
      if (process.env.SIGEM_NO_ABRIR !== '1') {
        if (process.platform === 'win32') {
          spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else {
          spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' }).unref();
        }
      }
    });
    server.on('error', error => {
      writeFileSync(join(local, 'errores.log'), error.message, { mode: 0o600 });
      console.error('No se pudo iniciar SIGEM. Revisa errores.log en ' + local);
      process.exitCode = 1;
    });
    server.on('exit', code => {
      if (code) {
        writeFileSync(join(local, 'errores.log'), errors, { mode: 0o600 });
        console.error('No se pudo iniciar SIGEM. Revisa errores.log en ' + local);
        process.exitCode = 1;
      }
    });
    process.on('SIGTERM', () => server.kill('SIGTERM'));
    process.on('SIGINT', () => server.kill('SIGINT'));
  });
});
