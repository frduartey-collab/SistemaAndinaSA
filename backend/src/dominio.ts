export type Rol = 'TECNICO' | 'SUPERVISOR' | 'TRABAJADOR' | 'BODEGA' | 'JEFATURA';

declare const codigoEquipo: unique symbol;
/** Solo se obtiene tras validar el patrón ^EQ-[0-9]{4}$. */
export type CodigoEquipo = string & { readonly [codigoEquipo]: true };

export type CriticidadEquipo = 'ALTA' | 'MEDIA' | 'BAJA';

export type EstadoEquipo = 'OPERATIVO' | 'EN_FALLA' | 'EN_MANTENCIÓN' | 'FUERA_DE_SERVICIO';

export interface LoginSolicitud { rut: string; password: string }
export interface UsuarioSesion { id: number; rut: string; nombre: string; rol: Rol; activo: boolean }
export interface RegistroSolicitud extends LoginSolicitud { nombre: string; rol: Rol }
export interface LoginRespuesta { token: string; usuario: UsuarioSesion; expiraEn: number }
export type CodigoError = 'RUT_INVALIDO' | 'CREDENCIALES_INVALIDAS' | 'USUARIO_INACTIVO'
  | 'DEMASIADOS_INTENTOS' | 'DATOS_INVALIDOS' | 'NO_AUTORIZADO' | 'SIN_PERMISO'
  | 'CODIGO_FORMATO_INVALIDO' | 'CODIGO_DUPLICADO' | 'ACTIVO_NO_ENCONTRADO' | 'RUT_DUPLICADO';
export interface ErrorRespuesta { codigo: CodigoError; mensaje: string }

export interface ActivoCrearSolicitud {
  codigo: CodigoEquipo;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  ubicacion: string;
  criticidad: CriticidadEquipo;
}
export interface ActivoActualizarSolicitud {
  nombre?: string;
  marca?: string | null;
  modelo?: string | null;
  ubicacion?: string;
  criticidad?: CriticidadEquipo;
  uso_acumulado_horas?: number;
  /** Compatibilidad de entrada: cualquier valor recibido se ignora. */
  codigo?: unknown;
}
export interface ActivoRespuesta {
  id: number;
  codigo: CodigoEquipo;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  ubicacion: string;
  criticidad: CriticidadEquipo;
  estado: EstadoEquipo;
  uso_acumulado_horas: number;
  fecha_alta: string;
  deleted_at: string | null;
}
export interface ConsultaActivos {
  q?: string;
  criticidad?: CriticidadEquipo;
  estado?: EstadoEquipo;
  page: number;
  size: number;
}
export interface PaginaActivos { items: ActivoRespuesta[]; total: number; page: number; size: number }

export type EstadoFalla = 'REPORTADA';

export interface FallaCrearSolicitud {
  equipo_id: number;
  descripcion: string;
  prioridad?: CriticidadEquipo;
}

export interface FallaRespuesta {
  id: number;
  equipo_id: number;
  equipo_codigo: CodigoEquipo;
  equipo_nombre: string;
  usuario_id: number;
  usuario_nombre: string;
  descripcion: string;
  prioridad: CriticidadEquipo;
  estado: EstadoFalla;
  fecha_reporte: string;
}

export interface ConsultaFallas { page: number; size: number }
export interface PaginaFallas extends ConsultaFallas { items: FallaRespuesta[]; total: number }
