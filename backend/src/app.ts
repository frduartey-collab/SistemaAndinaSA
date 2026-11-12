import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Datos } from './datos.js';
import { ErrorAPI } from './errores.js';
import { hashPassword, verificarPassword, hashToken, rutValido } from './seguridad.js';
import { solicitud, idPositivo } from './validacion.js';
import type { LoginSolicitud, LoginRespuesta, UsuarioSesion, ErrorRespuesta, EquipoCrearSolicitud, EquipoActualizarSolicitud } from './dominio.js';

interface Options {
  secret: string;
  datos?: Datos;
  now?: () => number;
  tokenSeconds?: number;
  maxAttempts?: number;
  windowMs?: number;
}
interface Context { usuario: UsuarioSesion; sesionId: string }
export function publico(user: UsuarioSesion): UsuarioSesion {
  return { id: user.id, rut: user.rut, nombre: user.nombre, rol: user.rol, activo: user.activo };
}

export async function crearAplicacion(options: Options) {
  if (Buffer.byteLength(options.secret) < 32) throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
  const now = options.now ?? Date.now;
  const ttl = options.tokenSeconds ?? 3600;
  const max = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 900_000;
  if (!Number.isInteger(ttl) || ttl < 1 || !Number.isInteger(max) || max < 1 || windowMs < 1) throw new Error('Políticas de sesión inválidas.');
  const datos = options.datos ?? new Datos();
  const key = new TextEncoder().encode(options.secret);
  const dummy = await hashPassword(randomUUID());
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(express.json({ limit: '16kb', strict: true }));

  function origen(req: Request): string { return req.ip ?? req.socket.remoteAddress ?? 'local'; }
  function bloqueado(req: Request, res: Response): void {
    res.setHeader('Retry-After', String(datos.reintentarEn(origen(req), now())));
    throw new ErrorAPI(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Intente más tarde.');
  }
  async function autenticado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
      if (!match) throw new Error('Token ausente');
      const token = match[1];
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: 'andina', audience: 'andina-api', currentDate: new Date(now()) });
      if (typeof payload.jti !== 'string' || typeof payload.sub !== 'string' || !/^[1-9][0-9]*$/.test(payload.sub)) throw new Error('Claims inválidos');
      const session = datos.sesion(payload.jti);
      if (!session || session.revocada !== 0 || Number(session.expira_en) <= now() || session.token_hash !== hashToken(token)
          || Number(session.usuario_id) !== Number(payload.sub)) throw new Error('Sesión inválida');
      const user = datos.usuarioPorId(Number(payload.sub));
      if (!user?.activo) throw new Error('Usuario no disponible');
      res.locals.usuario = publico(user);
      res.locals.sesionId = payload.jti;
      next();
    } catch {
      res.setHeader('WWW-Authenticate', 'Bearer');
      next(new ErrorAPI(401, 'NO_AUTORIZADO', 'Se requiere una sesión válida.'));
    }
  }
  function supervisor(_req: Request, res: Response, next: NextFunction): void {
    if ((res.locals as Context).usuario.rol !== 'SUPERVISOR') {
      next(new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene permiso para modificar equipos.'));
    } else next();
  }

  app.post('/auth/login', async (req, res) => {
    const ip = origen(req);
    if (datos.intentos(ip, now()) >= max) bloqueado(req, res);
    let input: LoginSolicitud;
    try { input = solicitud<LoginSolicitud>('auth', 'LoginSolicitud', req.body); }
    catch (error) {
      if (datos.fallarLogin(ip, now(), windowMs) >= max) bloqueado(req, res);
      throw error;
    }
    if (!rutValido(input.rut)) {
      if (datos.fallarLogin(ip, now(), windowMs) >= max) bloqueado(req, res);
      throw new ErrorAPI(400, 'RUT_INVALIDO', 'El dígito verificador del RUT no es válido.');
    }
    const user = datos.usuarioPorRut(input.rut);
    const correct = await verificarPassword(input.password, user?.passwordHash ?? dummy);
    if (datos.intentos(ip, now()) >= max) bloqueado(req, res);
    if (!user || !correct) {
      if (datos.fallarLogin(ip, now(), windowMs) >= max) bloqueado(req, res);
      datos.auditar(null, 'LOGIN_RECHAZADO', null, now());
      throw new ErrorAPI(401, 'CREDENCIALES_INVALIDAS', 'Las credenciales no son válidas.');
    }
    if (!user.activo) throw new ErrorAPI(403, 'USUARIO_INACTIVO', 'El usuario está inactivo.');
    const id = randomUUID();
    const issued = Math.floor(now() / 1000);
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(user.id)).setJti(id).setIssuer('andina').setAudience('andina-api')
      .setIssuedAt(issued).setExpirationTime(issued + ttl).sign(key);
    datos.transaccion(() => {
      datos.crearSesion(id, user.id, hashToken(token), (issued + ttl) * 1000);
      datos.limpiarIntentos(ip);
      datos.auditar(user.id, 'LOGIN_CORRECTO', null, now());
    });
    const body: LoginRespuesta = { token, usuario: publico(user), expiraEn: ttl };
    res.status(200).json(body);
  });
  app.get('/auth/me', autenticado, (_req, res) => { res.json((res.locals as Context).usuario); });
  app.post('/auth/logout', autenticado, (_req, res) => {
    const context = res.locals as Context;
    datos.transaccion(() => { datos.revocar(context.sesionId); datos.auditar(context.usuario.id, 'LOGOUT', null, now()); });
    res.status(204).end();
  });

  app.get('/activos', autenticado, (req, res) => {
    if (Object.keys(req.query).some(key => key !== 'limit' && key !== 'offset')) throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Parámetros de consulta desconocidos.');
    const limitRaw = req.query.limit ?? '50', offsetRaw = req.query.offset ?? '0';
    if (typeof limitRaw !== 'string' || !/^[0-9]+$/.test(limitRaw) || typeof offsetRaw !== 'string' || !/^[0-9]+$/.test(offsetRaw)) throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Paginación inválida.');
    const limit = Number(limitRaw), offset = Number(offsetRaw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset)) throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Paginación fuera de rango.');
    res.json(datos.listar(limit, offset));
  });
  app.post('/activos', autenticado, supervisor, (req, res) => {
    const input = solicitud<EquipoCrearSolicitud>('activos', 'EquipoCrearSolicitud', req.body);
    const result = datos.crear(input, (res.locals as Context).usuario.id, now());
    res.location('/activos/' + result.id).status(201).json(result);
  });
  app.get('/activos/:id', autenticado, (req, res) => { res.json(datos.obtener(idPositivo(req.params.id))); });
  app.patch('/activos/:id', autenticado, supervisor, (req, res) => {
    const id = idPositivo(req.params.id);
    const input = solicitud<EquipoActualizarSolicitud>('activos', 'EquipoActualizarSolicitud', req.body);
    res.json(datos.modificar(id, input, (res.locals as Context).usuario.id, now()));
  });
  app.delete('/activos/:id', autenticado, supervisor, (req, res) => {
    datos.eliminar(idPositivo(req.params.id), (res.locals as Context).usuario.id, now());
    res.status(204).end();
  });

  app.use((_req, res) => { res.status(404).json({ codigo: 'NO_ENCONTRADO', mensaje: 'La ruta no existe.' }); });
  const errores: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ErrorAPI) {
      const body: ErrorRespuesta = { codigo: error.codigo, mensaje: error.message };
      res.status(error.status).json(body);
    } else if (error && typeof error === 'object' && 'type' in error && (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')) {
      res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo JSON es inválido o demasiado grande.' } satisfies ErrorRespuesta);
    } else {
      res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operación.' });
    }
  };
  app.use(errores);
  return { app, datos, close: () => datos.close() };
}
