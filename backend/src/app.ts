import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Datos } from './datos.js';
import { ErrorAPI } from './errores.js';
import { hashPassword, verificarPassword, hashToken, rutValido } from './seguridad.js';
import { solicitud, idPositivo, consultaActivos } from './validacion.js';
import type { LoginSolicitud, LoginRespuesta, UsuarioSesion, ErrorRespuesta, ActivoCrearSolicitud, ActivoActualizarSolicitud } from './dominio.js';

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
  const ttl = options.tokenSeconds ?? 28_800;
  const max = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 300_000;
  if (!Number.isInteger(ttl) || ttl < 1 || !Number.isInteger(max) || max < 1 || windowMs < 1) throw new Error('Políticas de sesión inválidas.');
  const datos = options.datos ?? new Datos();
  const dummy = await hashPassword(randomUUID());
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(express.json({ limit: '16kb', strict: true }));

  function bloqueado(rut: string, res: Response): void {
    res.setHeader('Retry-After', String(datos.reintentarEn(rut, now())));
    throw new ErrorAPI(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Intente más tarde.');
  }
  async function autenticado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
      if (!match) throw new Error('Token ausente');
      const token = match[1];
      const payload = jwt.verify(token, options.secret, { algorithms: ['HS256'], issuer: 'andina', audience: 'andina-api', clockTimestamp: Math.floor(now() / 1000) });
      if (typeof payload === 'string') throw new Error('Claims inválidos');
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
  function leerActivos(_req: Request, res: Response, next: NextFunction): void {
    const rol = (res.locals as Context).usuario.rol;
    if (!['SUPERVISOR', 'JEFATURA', 'TECNICO', 'TRABAJADOR'].includes(rol)) {
      next(new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso a activos.'));
    } else next();
  }
  function escribirActivos(_req: Request, res: Response, next: NextFunction): void {
    const rol = (res.locals as Context).usuario.rol;
    if (rol !== 'SUPERVISOR' && rol !== 'JEFATURA') {
      next(new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene permiso para modificar activos.'));
    } else next();
  }

  app.post('/auth/login', async (req, res) => {
    const input = solicitud<LoginSolicitud>('auth', 'LoginSolicitud', req.body);
    if (!rutValido(input.rut)) throw new ErrorAPI(400, 'RUT_INVALIDO', 'El RUT no es válido.');
    const rut = input.rut.toUpperCase();
    if (datos.intentos(rut, now()) >= max) bloqueado(rut, res);
    const user = datos.usuarioPorRut(input.rut);
    const correct = await verificarPassword(input.password, user?.passwordHash ?? dummy);
    if (datos.intentos(rut, now()) >= max) bloqueado(rut, res);
    if (!user || !correct) {
      datos.fallarLogin(rut, now(), windowMs);
      datos.auditar(null, 'LOGIN_RECHAZADO', null, now());
      throw new ErrorAPI(401, 'CREDENCIALES_INVALIDAS', 'Las credenciales no son válidas.');
    }
    if (!user.activo) {
      datos.fallarLogin(rut, now(), windowMs);
      throw new ErrorAPI(403, 'USUARIO_INACTIVO', 'El usuario está inactivo.');
    }
    if (user.passwordHash.startsWith('scrypt$') && Buffer.byteLength(input.password) <= 72) {
      datos.actualizarPassword(user.id, await hashPassword(input.password));
    }
    const id = randomUUID();
    const issued = Math.floor(now() / 1000);
    const token = jwt.sign({ iat: issued }, options.secret, {
      algorithm: 'HS256', subject: String(user.id), jwtid: id, issuer: 'andina', audience: 'andina-api', expiresIn: ttl,
    });
    datos.transaccion(() => {
      datos.crearSesion(id, user.id, hashToken(token), (issued + ttl) * 1000);
      datos.limpiarIntentos(rut);
      datos.auditar(user.id, 'LOGIN_CORRECTO', null, now());
    });
    const body: LoginRespuesta = { token, usuario: publico(user), expiraEn: ttl };
    res.status(200).json(body);
  });
  app.get('/auth/me', autenticado, (_req, res) => { res.json((res.locals as Context).usuario); });
  app.post('/auth/logout', autenticado, (_req, res) => {
    // El YAML exige revocación: además de descartar el token en el cliente, invalidamos su sesión.
    // No usamos logout stateless, cuyo token seguiría siendo válido hasta expirar.
    const context = res.locals as Context;
    datos.transaccion(() => { datos.revocar(context.sesionId); datos.auditar(context.usuario.id, 'LOGOUT', null, now()); });
    res.status(204).end();
  });

  app.get('/activos', autenticado, leerActivos, (req, res) => {
    res.json(datos.listar(consultaActivos(req.query)));
  });
  app.post('/activos', autenticado, escribirActivos, (req, res) => {
    const input = solicitud<ActivoCrearSolicitud>('activos', 'ActivoCrearSolicitud', req.body);
    const result = datos.crear(input, (res.locals as Context).usuario.id, now());
    res.location('/activos/' + result.id).status(201).json(result);
  });
  app.get('/activos/:id', autenticado, leerActivos, (req, res) => {
    res.json(datos.obtener(idPositivo(req.params.id)));
  });
  app.patch('/activos/:id', autenticado, escribirActivos, (req, res) => {
    const id = idPositivo(req.params.id);
    const input = solicitud<ActivoActualizarSolicitud>('activos', 'ActivoActualizarSolicitud', req.body);
    res.json(datos.modificar(id, input, (res.locals as Context).usuario.id, now()));
  });
  app.delete('/activos/:id', autenticado, escribirActivos, (req, res) => {
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
