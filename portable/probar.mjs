import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.argv[2];
const folder = mkdtempSync(join(tmpdir(), 'sigem-portable-'));
const env = { ...process.env, HOME: folder, LOCALAPPDATA: folder, SIGEM_NO_ABRIR: '1' };
const node = join(root, process.platform === 'win32' ? 'node.exe' : 'node');
const child = spawn(node, [join(root, 'iniciar.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = '';
child.stderr.on('data', value => { errors += value; });
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SIGEM no inició: ' + errors)), 30000);
    child.on('error', reject);
    child.on('exit', code => reject(new Error('SIGEM terminó: ' + code + ' ' + errors)));
    child.stdout.on('data', chunk => {
      const match = /SIGEM_LISTO=(\d+)/.exec(String(chunk));
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const local = process.platform === 'win32' ? join(folder, 'SIGEM') : join(folder, 'Library', 'Application Support', 'SIGEM');
  const credentials = JSON.parse(readFileSync(join(local, 'credenciales-demo.json')));
  const base = 'http://127.0.0.1:' + port;
  const page = await fetch(base + '/login');
  assert.equal(page.status, 200);
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rut: '11111111-1', password: credentials.claves.SUPERVISOR }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const list = await fetch(base + '/api/activos', { headers: { Authorization: 'Bearer ' + session.token } });
  assert.equal((await list.json()).total, 2);
  console.log('SIGEM inició y se verificaron la sesión y los dos equipos de demostración.');
} finally {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
  await new Promise(resolve => child.once('exit', resolve));
  try { rmSync(folder, { recursive: true, force: true }); } catch {}
}
