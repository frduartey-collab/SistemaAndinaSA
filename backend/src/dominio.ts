export type Rol = 'TECNICO' | 'SUPERVISOR' | 'TRABAJADOR' | 'BODEGA' | 'JEFATURA';

declare const codigoEquipo: unique symbol;
/** Solo se obtiene tras validar el patrón ^EQ-[0-9]{4}$. */
export type CodigoEquipo = string & { readonly [codigoEquipo]: true };

export type CriticidadEquipo = 'ALTA' | 'MEDIA' | 'BAJA';

export type EstadoEquipo = 'OPERATIVO' | 'EN_FALLA' | 'EN_MANTENCIÓN' | 'FUERA_DE_SERVICIO';

export interface LoginSolicitud { rut: string; password: string }
export interface UsuarioSesion { id: number; rut: string; nombre: string; rol: Rol; activo: boolean }
export interface LoginRespuesta { token: string; usuario: UsuarioSesion; expiraEn: number }
export type CodigoError = 'RUT_INVALIDO' | 'CREDENCIALES_INVALIDAS' | 'USUARIO_INACTIVO'
  | 'DEMASIADOS_INTENTOS' | 'DATOS_INVALIDOS' | 'NO_AUTORIZADO' | 'SIN_PERMISO'
  | 'CODIGO_INVALIDO' | 'CODIGO_DUPLICADO' | 'EQUIPO_NO_ENCONTRADO';
export interface ErrorRespuesta { codigo: CodigoError; mensaje: string }

export interface EquipoCrearSolicitud {
  codigo: CodigoEquipo;
  nombre: string;
  ubicacion: string;
  criticidad: CriticidadEquipo;
  estado?: EstadoEquipo;
}
export type EquipoActualizarSolicitud = Partial<EquipoCrearSolicitud>;
export interface EquipoRespuesta extends EquipoCrearSolicitud {
  id: number;
  estado: EstadoEquipo;
  creadoEn: string;
  actualizadoEn: string;
  eliminadoEn: string | null;
}
export interface EquipoListaRespuesta { items: EquipoRespuesta[]; total: number }
