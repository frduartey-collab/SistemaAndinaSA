import express, { type Express } from 'express';
import { accessSync, constants } from 'node:fs';
import { extname, join } from 'node:path';

export function montarWeb(api: Express, frontendDir?: string): Express {
  const web = express();
  web.disable('x-powered-by');
  web.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  web.use('/api', api);
  if (!frontendDir) {
    // En desarrollo se conservan las rutas históricas para clientes de la API local.
    web.use(api);
    return web;
  }

  const index = join(frontendDir, 'index.html');
  accessSync(index, constants.R_OK);
  web.use(express.static(frontendDir, {
    index: false,
    redirect: false,
    setHeaders(res, file) {
      res.setHeader('Cache-Control', file.startsWith(join(frontendDir, 'assets') + '/')
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  web.get('/{*ruta}', (req, res, next) => {
    if (extname(req.path) || req.path.split('/').some(p => p.startsWith('.')) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache').sendFile(index);
  });
  web.use((_req, res) => { res.sendStatus(404); });
  return web;
}
