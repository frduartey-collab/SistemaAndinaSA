import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { crearAplicacion } from '../dist/app.js';

test('Un solo origen sirve React, protege API y ERP y conserva los 404 de recursos', async t => {
  const dist = mkdtempSync(join(tmpdir(), 'sigem-web-'));
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  writeFileSync(join(dist, 'index.html'), '<html lang="es"><title>SIGEM</title></html>');
  writeFileSync(join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  const backend = await crearAplicacion({ secret: 'a'.repeat(40), frontendDir: dist });
  t.after(() => backend.close());
  const web = request(backend.app);
  for (const ruta of ['/', '/ordenes/20', '/ruta-de-react']) {
    await web.get(ruta).set('Accept', 'text/html').expect(200).expect(/<title>SIGEM/);
  }
  await web.get('/sw.js').expect(200).expect('Content-Type', /javascript/).expect('Cache-Control', /no-cache/);
  await web.get('/assets/ausente.js').set('Accept', '*/*').expect(404);
  await web.get('/api/auth/me').expect(401).expect('Cache-Control', /no-store/);
  await web.get('/api/v1/erp/costos-repuestos').expect(401);
  const missing = await web.get('/api/desconocida').set('Accept', 'text/html').expect(404);
  assert.equal(missing.body.codigo, 'NO_ENCONTRADO');
  await web.post('/ruta-de-react').expect(404);
});
