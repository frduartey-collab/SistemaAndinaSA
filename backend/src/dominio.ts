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
  | 'CODIGO_FORMATO_INVALIDO' | 'CODIGO_DUPLICADO' | 'ACTIVO_NO_ENCONTRADO' | 'RUT_DUPLICADO'
  | 'FALLA_NO_ENCONTRADA' | 'ORDEN_DUPLICADA' | 'TECNICO_NO_DISPONIBLE'
  | 'ORDEN_NO_ENCONTRADA' | 'TRANSICION_ORDEN_INVALIDA' | 'ORDEN_YA_CERRADA'
  | 'REPUESTO_NO_ENCONTRADO' | 'REPUESTO_CON_STOCK' | 'STOCK_INSUFICIENTE'
  | 'FOTO_NO_ENCONTRADA' | 'NOTIFICACION_NO_ENCONTRADA';
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
export type TipoFotoFalla = 'image/jpeg' | 'image/png' | 'image/webp';

export interface FotoFallaSolicitud {
  nombre: string;
  tipo: TipoFotoFalla;
  contenido_base64: string;
}

export interface FotoFallaResumen {
  id: number;
  nombre: string;
  tipo: TipoFotoFalla;
}

export interface FallaCrearSolicitud {
  equipo_id: number;
  descripcion: string;
  prioridad?: CriticidadEquipo;
  fotos?: FotoFallaSolicitud[];
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

export interface ConsultaFallas { page: number; size: number; sin_orden?: boolean }
export interface PaginaFallas { items: FallaRespuesta[]; total: number; page: number; size: number }

export interface FallaDetalleRespuesta extends FallaRespuesta { fotos: FotoFallaResumen[] }

export interface NotificacionFalla {
  id: number;
  falla_id: number;
  equipo_codigo: CodigoEquipo;
  equipo_nombre: string;
  fecha: string;
  leida: boolean;
}

export interface ConsultaNotificaciones { page: number; size: number }
export interface PaginaNotificaciones extends ConsultaNotificaciones {
  items: NotificacionFalla[];
  total: number;
}

export type EstadoOrden = 'PENDIENTE' | 'EN_PROGRESO' | 'CERRADA';

export interface OrdenCrearSolicitud {
  falla_id: number;
  tecnico_id: number;
  fecha_limite: string;
}

export interface OrdenEstadoSolicitud { estado: 'EN_PROGRESO' }

export interface OrdenCierreSolicitud {
  diagnostico: string;
  solucion: string;
  duracion_minutos: number;
  repuestos_usados?: string;
  repuestos_consumidos?: RepuestoConsumoSolicitud[];
}

export interface IntervencionRespuesta {
  orden_id: number;
  autor_id: number;
  diagnostico: string;
  solucion: string;
  duracion_minutos: number;
  repuestos_usados: string | null;
  repuestos_consumidos: RepuestoConsumidoRespuesta[];
  registrada_en: string;
}

export interface OrdenRespuesta extends OrdenCrearSolicitud {
  id: number;
  tecnico_nombre: string;
  equipo_codigo: CodigoEquipo;
  equipo_nombre: string;
  descripcion: string;
  prioridad: CriticidadEquipo;
  estado: EstadoOrden;
}

export interface OrdenDetalleRespuesta extends OrdenRespuesta {
  intervencion: IntervencionRespuesta | null;
}

interface PaginacionOrdenes { page: number; size: number }
export interface ConsultaOrdenes extends PaginacionOrdenes { solo_abiertas?: boolean }
export interface ConsultaTecnicos extends PaginacionOrdenes { q?: string }
export interface TecnicoResumen { id: number; nombre: string }
export interface PaginaOrdenes extends PaginacionOrdenes { items: OrdenRespuesta[]; total: number }
export interface PaginaTecnicos extends PaginacionOrdenes { items: TecnicoResumen[]; total: number }

export interface RepuestoActualizarSolicitud {
  nombre: string;
  descripcion?: string;
  stock_minimo: number;
}

export interface RepuestoCrearSolicitud extends RepuestoActualizarSolicitud { codigo: string }

export interface RepuestoRespuesta {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  stock_actual: number;
  stock_minimo: number;
}

export interface ConsultaRepuestos { q?: string; page: number; size: number }
export interface PaginaRepuestos { items: RepuestoRespuesta[]; total: number; page: number; size: number }

export type TipoMovimientoRepuesto = 'ENTRADA' | 'SALIDA';
export interface MovimientoRepuestoSolicitud {
  tipo: TipoMovimientoRepuesto;
  cantidad: number;
  motivo?: string;
}

export interface RepuestoConsumoSolicitud { repuesto_id: number; cantidad: number }
export interface RepuestoConsumidoRespuesta extends RepuestoConsumoSolicitud { codigo: string; nombre: string }
