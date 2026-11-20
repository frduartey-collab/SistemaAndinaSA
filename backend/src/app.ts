import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Datos } from './datos.js';
import { Fallas } from './fallas.js';
import { OrdenesTrabajo } from './ordenes.js';
import { InventarioRepuestos } from './repuestos.js';
import { Sedes } from './sedes.js';
import { HistorialEquipos } from './historial-equipos.js';
import { ErrorAPI } from './errores.js';
import { hashPassword, verificarPassword, hashToken } from './seguridad.js';
import { rutValido } from './rut.js';
import {
  solicitud, idPositivo, consultaActivos, consultaFallas, consultaHistorialEquipo, consultaNotificaciones,
  consultaOrdenes, consultaTecnicos, consultaRepuestos,
} from './validacion.js';
import type {
  LoginSolicitud, LoginRespuesta, RegistroSolicitud, UsuarioSesion, ErrorRespuesta,
  ActivoCrearSolicitud, ActivoActualizarSolicitud, FallaCrearSolicitud,
  OrdenCierreSolicitud, OrdenCrearSolicitud, OrdenEstadoSolicitud, Rol,
  MovimientoRepuestoSolicitud, RepuestoActualizarSolicitud, RepuestoCrearSolicitud,
} from './dominio.js';

import type { SedeSolicitud } from './dominio.js';

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
  const { id, rut, nombre, rol, activo, tenant_id, plan } = user;
  return { id, rut, nombre, rol, activo, tenant_id, plan };
}

export async function crearAplicacion(options: Options) {
  if (Buffer.byteLength(options.secret) < 32) throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
  const now = options.now ?? Date.now;
  const ttl = options.tokenSeconds ?? 28_800;
  const max = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 300_000;
  if (!Number.isInteger(ttl) || ttl < 1 || !Number.isInteger(max) || max < 1 || windowMs < 1) throw new Error('Políticas de sesión inválidas.');
  const datos = options.datos ?? new Datos();
  const fallas = new Fallas(datos);
  const inventario = new InventarioRepuestos(datos);
  const ordenes = new OrdenesTrabajo(datos, inventario);
  const historial = new HistorialEquipos(datos);
  const sedes = new Sedes(datos);
  datos.migrarTenantsOperativos();
  const dummy = await hashPassword(randomUUID());
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  // Solo este endpoint admite fotos codificadas y autoriza antes de leer el cuerpo.
  app.post('/fallas', autenticado, accesoFallas, express.json({ limit: '21mb', strict: true }), (req, res) => {
    const input = solicitud<FallaCrearSolicitud>('fallas', 'FallaCrearSolicitud', req.body);
    const { id, tenant_id } = (res.locals as Context).usuario;
    const falla = datos.enTenant(tenant_id, () => fallas.crear(input, id, now()));
    res.status(201).json(falla);
  });
  app.use(express.json({ limit: '16kb', strict: true }));

  function bloqueado(rut: string, res: Response): void {
    res.setHeader('Retry-After', String(datos.reintentarEn(rut, now())));
    throw new ErrorAPI(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Intente más tarde.');
  }
  async function autenticado(req: Request, res: Response, next: NextFunction): Promise<void> {
    let usuario: UsuarioSesion;
    let sesionId: string;
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
      const user = datos.usuarioPorIdGlobal(Number(payload.sub));
      if (!user?.activo || user.tenant_id !== Number(session.tenant_id)
          || datos.tenantPorId(user.tenant_id)?.estado !== 'ACTIVO') throw new Error('Usuario no disponible');
      usuario = publico(user);
      sesionId = payload.jti;
    } catch {
      res.setHeader('WWW-Authenticate', 'Bearer');
      next(new ErrorAPI(401, 'NO_AUTORIZADO', 'Se requiere una sesión válida.'));
      return;
    }

    res.locals.usuario = usuario;
    res.locals.sesionId = sesionId;
    datos.enTenant(usuario.tenant_id, () => next());
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
      if (user) datos.enTenant(user.tenant_id, () => datos.auditar(null, 'LOGIN_RECHAZADO', null, now()));
      throw new ErrorAPI(401, 'CREDENCIALES_INVALIDAS', 'Las credenciales no son válidas.');
    }
    const tenant = datos.tenantPorId(user.tenant_id);
    if (!user.activo || tenant?.estado !== 'ACTIVO') {
      datos.fallarLogin(rut, now(), windowMs);
      throw new ErrorAPI(403, 'USUARIO_INACTIVO', 'El usuario está inactivo.');
    }
    if (user.passwordHash.startsWith('scrypt$') && Buffer.byteLength(input.password) <= 72) {
      const hash = await hashPassword(input.password);
      datos.enTenant(tenant.id, () => datos.actualizarPassword(user.id, hash));
    }
    const id = randomUUID();
    const issued = Math.floor(now() / 1000);
    const token = jwt.sign({ iat: issued }, options.secret, {
      algorithm: 'HS256', subject: String(user.id), jwtid: id, issuer: 'andina', audience: 'andina-api', expiresIn: ttl,
    });
    datos.enTenant(tenant.id, () => datos.transaccion(() => {
      datos.crearSesion(id, user.id, hashToken(token), (issued + ttl) * 1000);
      datos.limpiarIntentos(rut);
      datos.auditar(user.id, 'LOGIN_CORRECTO', null, now());
    }));
    const body: LoginRespuesta = { token, usuario: publico({ ...user, plan: tenant.plan }), expiraEn: ttl };
    res.status(200).json(body);
  });
  app.post('/auth/register', (req, res, next) => {
    const origen = 'registro:' + (req.ip ?? req.socket.remoteAddress ?? 'local');
    const ahora = now();
    if (datos.intentos(origen, ahora) >= 10) bloqueado(origen, res);
    datos.fallarLogin(origen, ahora, 600_000);

    if (req.get('Authorization') !== undefined) {
      return autenticado(req, res, next);
    }
    next();
  }, async (req, res) => {
    const input = solicitud<RegistroSolicitud>('auth', 'RegistroSolicitud', req.body);
    const actor = res.locals.usuario as UsuarioSesion | undefined;
    if (actor) {
      if (!administrar(actor.rol) || (actor.rol === 'SUPERVISOR'
          && !['TECNICO', 'TRABAJADOR', 'BODEGA'].includes(input.rol))) {
        throw new ErrorAPI(403, 'SIN_PERMISO', 'Tu sesión no permite asignar ese rol.');
      }
      if (input.nombre_empresa !== undefined) {
        throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La cuenta se crea dentro de tu organización.');
      }
    } else {
      if (input.rol !== 'JEFATURA') {
        throw new ErrorAPI(403, 'SIN_PERMISO', 'El registro público crea la cuenta responsable de una organización nueva.');
      }
      if (!input.nombre_empresa) {
        throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Ingresa el nombre de tu organización.');
      }
    }

    const rut = input.rut.toUpperCase();
    if (rut.startsWith('0') || !rutValido(rut)) {
      throw new ErrorAPI(400, 'RUT_INVALIDO', 'Ingresa un RUT válido, sin ceros al comienzo.');
    }
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La contraseña admite hasta 72 bytes.');
    }

    const verificarRutLibre = () => {
      const rutConCero = rut.length === 9 ? '0' + rut : rut;
      if (datos.usuarioPorRut(rut) || (rutConCero !== rut && datos.usuarioPorRut(rutConCero))) {
        throw new ErrorAPI(409, 'RUT_DUPLICADO', 'Ya existe una cuenta con ese RUT.');
      }
    };

    verificarRutLibre();
    const passwordHash = await hashPassword(input.password);
    const ahora = now();
    const usuario = datos.transaccion(() => {
      verificarRutLibre();
      const tenantId = actor?.tenant_id ?? datos.crearTenant(input.nombre_empresa!.trim(), 'PARTICULAR', ahora).id;
      return datos.enTenant(tenantId, () => {
        const creado = datos.crearUsuario({
          rut, nombre: input.nombre.trim(), passwordHash, rol: input.rol, activo: true,
        });
        datos.auditar(actor?.id ?? creado.id, 'USUARIO_REGISTRADO', creado.id, ahora);
        return creado;
      });
    });
    res.status(201).json(publico(usuario));
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
  function crearActivo(req: Request, res: Response): void {
    const input = solicitud<ActivoCrearSolicitud>('activos', 'ActivoCrearSolicitud', req.body);
    const result = datos.crear(input, (res.locals as Context).usuario.id, now());
    res.location('/activos/' + result.id).status(201).json(result);
  }
  app.post('/activos', autenticado, escribirActivos, crearActivo);
  app.post('/equipos', autenticado, escribirActivos, crearActivo);
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
  app.get('/equipos/:id/historial', autenticado, (req, res) => {
    const { rol } = (res.locals as Context).usuario;
    if (rol !== 'TECNICO' && !administrar(rol)) {
      throw new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso al historial de equipos.');
    }
    res.json(historial.consultar(idPositivo(req.params.id), consultaHistorialEquipo(req.query)));
  });

  function accesoFallas(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!['SUPERVISOR', 'JEFATURA', 'TECNICO', 'TRABAJADOR'].includes(rol)) {
      next(new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso a Fallas.'));
      return;
    }
    next();
  }

  app.get('/fallas', autenticado, accesoFallas, (req, res) => {
    const { id, rol } = (res.locals as Context).usuario;
    const admin = administrar(rol);
    const consulta = consultaFallas(req.query);
    if (consulta.sin_orden && !admin) throw new ErrorAPI(403, 'SIN_PERMISO', 'Solo un administrador puede consultar fallas para asignar.');
    res.json(fallas.listar(consulta, admin ? undefined : id));
  });
  app.get('/fallas/:id', autenticado, accesoFallas, (req, res) => {
    const { id, rol } = (res.locals as Context).usuario;
    res.json(fallas.detalle(idPositivo(req.params.id), administrar(rol) ? undefined : id));
  });
  app.get('/fallas/:id/fotos/:fotoId', autenticado, accesoFallas, (req, res) => {
    const { id, rol } = (res.locals as Context).usuario;
    const foto = fallas.foto(idPositivo(req.params.id), idPositivo(req.params.fotoId), administrar(rol) ? undefined : id);
    res.set('Content-Type', foto.tipo).end(foto.contenido);
  });

  function administrar(rol: Rol): boolean {
    return rol === 'SUPERVISOR' || rol === 'JEFATURA';
  }

  function accesoNotificaciones(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!administrar(rol)) throw new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso a notificaciones.');
    next();
  }

  app.get('/notificaciones', autenticado, accesoNotificaciones, (req, res) => {
    const { id } = (res.locals as Context).usuario;
    res.json(fallas.listarNotificaciones(consultaNotificaciones(req.query), id));
  });
  app.patch('/notificaciones/:id/leida', autenticado, accesoNotificaciones, (req, res) => {
    const { id } = (res.locals as Context).usuario;
    fallas.leerNotificacion(idPositivo(req.params.id), id, now());
    res.status(204).end();
  });

  function exigirAdministracionOrdenes(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!administrar(rol)) throw new ErrorAPI(403, 'SIN_PERMISO', 'Solo Supervisor o Jefatura puede asignar órdenes.');
    next();
  }

  function accesoOrdenes(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!administrar(rol) && rol !== 'TECNICO') throw new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso a Órdenes.');
    next();
  }

  app.get('/ordenes/tecnicos', autenticado, exigirAdministracionOrdenes, (req, res) => {
    res.json(ordenes.listarTecnicos(consultaTecnicos(req.query)));
  });
  app.post('/ordenes', autenticado, exigirAdministracionOrdenes, (req, res) => {
    const input = solicitud<OrdenCrearSolicitud>('ordenes', 'OrdenCrearSolicitud', req.body);
    const { id } = (res.locals as Context).usuario;
    res.status(201).json(ordenes.crear(input, id, now()));
  });
  app.get('/ordenes', autenticado, accesoOrdenes, (req, res) => {
    const { id, rol } = (res.locals as Context).usuario;
    res.json(ordenes.listar(consultaOrdenes(req.query), administrar(rol) ? undefined : id));
  });
  app.get('/ordenes/:id', autenticado, accesoOrdenes, (req, res) => {
    const ordenId = idPositivo(req.params.id);
    const { id, rol } = (res.locals as Context).usuario;
    res.json(ordenes.detalle(ordenId, administrar(rol) ? undefined : id));
  });
  app.patch('/ordenes/:id/estado', autenticado, accesoOrdenes, (req, res) => {
    const ordenId = idPositivo(req.params.id);
    const input = solicitud<OrdenEstadoSolicitud>('ordenes', 'OrdenEstadoSolicitud', req.body);
    const { id, rol } = (res.locals as Context).usuario;
    res.json(ordenes.cambiarEstado(ordenId, input.estado, id, administrar(rol), now()));
  });
  app.put('/ordenes/:id/cierre', autenticado, (req, res) => {
    const { id, rol } = (res.locals as Context).usuario;
    if (rol !== 'TECNICO') throw new ErrorAPI(403, 'SIN_PERMISO', 'El cierre corresponde al técnico asignado.');
    const ordenId = idPositivo(req.params.id);
    const input = solicitud<OrdenCierreSolicitud>('ordenes', 'OrdenCierreSolicitud', req.body);
    res.json(ordenes.cerrar(ordenId, input, id, now()));
  });

  function gestionarInventario(rol: Rol): boolean {
    return rol === 'BODEGA' || rol === 'JEFATURA';
  }

  function leerRepuestos(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!gestionarInventario(rol) && rol !== 'TECNICO') {
      throw new ErrorAPI(403, 'SIN_PERMISO', 'El rol no tiene acceso a repuestos.');
    }
    next();
  }

  function escribirRepuestos(_req: Request, res: Response, next: NextFunction): void {
    const { rol } = (res.locals as Context).usuario;
    if (!gestionarInventario(rol)) {
      throw new ErrorAPI(403, 'SIN_PERMISO', 'Solo Bodega o Jefatura puede gestionar repuestos.');
    }
    next();
  }

  app.get('/repuestos', autenticado, leerRepuestos, (req, res) => {
    res.json(inventario.listar(consultaRepuestos(req.query)));
  });
  app.post('/repuestos', autenticado, escribirRepuestos, (req, res) => {
    const input = solicitud<RepuestoCrearSolicitud>('repuestos', 'RepuestoCrearSolicitud', req.body);
    const { id } = (res.locals as Context).usuario;
    res.status(201).json(inventario.crear(input, id, now()));
  });
  app.get('/repuestos/:id', autenticado, leerRepuestos, (req, res) => {
    res.json(inventario.obtener(idPositivo(req.params.id)));
  });
  app.put('/repuestos/:id', autenticado, escribirRepuestos, (req, res) => {
    const repuestoId = idPositivo(req.params.id);
    const input = solicitud<RepuestoActualizarSolicitud>('repuestos', 'RepuestoActualizarSolicitud', req.body);
    const { id } = (res.locals as Context).usuario;
    res.json(inventario.actualizar(repuestoId, input, id, now()));
  });
  app.delete('/repuestos/:id', autenticado, escribirRepuestos, (req, res) => {
    const repuestoId = idPositivo(req.params.id);
    const { id } = (res.locals as Context).usuario;
    inventario.darDeBaja(repuestoId, id, now());
    res.status(204).end();
  });
  app.post('/repuestos/:id/movimientos', autenticado, escribirRepuestos, (req, res) => {
    const repuestoId = idPositivo(req.params.id);
    const input = solicitud<MovimientoRepuestoSolicitud>('repuestos', 'MovimientoRepuestoSolicitud', req.body);
    const { id } = (res.locals as Context).usuario;
    res.status(201).json(inventario.mover(repuestoId, input, id, now()));
  });

  function requiereEmpresa(_req: Request, res: Response, next: NextFunction): void {
    if ((res.locals as Context).usuario.plan !== 'EMPRESA') {
      throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'La gestión de sedes está disponible en el plan Empresa.');
    }
    next();
  }

  app.get('/sedes', autenticado, requiereEmpresa, (_req, res) => {
    res.json(sedes.listar());
  });
  app.get('/sedes/:id', autenticado, requiereEmpresa, (req, res) => {
    res.json(sedes.obtener(idPositivo(req.params.id)));
  });
  app.post('/sedes', autenticado, requiereEmpresa, escribirActivos, (req, res) => {
    const ficha = solicitud<SedeSolicitud>('sedes', 'SedeSolicitud', req.body);
    res.status(201).json(sedes.crear(ficha, (res.locals as Context).usuario.id, now()));
  });
  app.put('/sedes/:id', autenticado, requiereEmpresa, escribirActivos, (req, res) => {
    const ficha = solicitud<SedeSolicitud>('sedes', 'SedeSolicitud', req.body);
    res.json(sedes.editar(idPositivo(req.params.id), ficha, (res.locals as Context).usuario.id, now()));
  });
  app.delete('/sedes/:id', autenticado, requiereEmpresa, escribirActivos, (req, res) => {
    sedes.eliminar(idPositivo(req.params.id), (res.locals as Context).usuario.id, now());
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
