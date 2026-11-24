export type PlanTenant = 'PARTICULAR' | 'EMPRESA';
export type EstadoTenant = 'ACTIVO' | 'INACTIVO';
export interface Tenant {
  id: number;
  nombre_empresa: string;
  plan: PlanTenant;
  fecha_suscripcion: string;
  estado: EstadoTenant;
}
export interface SedeSolicitud { nombre: string; direccion: string }
export interface SedeRespuesta extends SedeSolicitud { id: number }

export type EstadoSuscripcion = 'PENDIENTE' | 'ACTIVA' | 'CANCELADA';
export interface CheckoutSuscripcionSolicitud { plan: PlanTenant }
export interface SuscripcionRespuesta {
  id: number;
  plan: PlanTenant;
  estado: EstadoSuscripcion;
  monto_clp: number;
  fecha_renovacion: string | null;
  metodo_pago_ref: string | null;
  puesta_marcha_clp: number;
}
export interface CobroSuscripcion {
  id: number;
  suscripcion_id: number;
  plan: PlanTenant;
  monto_clp: number;
  puesta_marcha_clp: number;
  fecha: string;
  metodo_pago_ref: string | null;
}
export interface ResumenSuscripcion {
  plan_actual: PlanTenant;
  activa: SuscripcionRespuesta | null;
  pendiente: SuscripcionRespuesta | null;
  cobros: CobroSuscripcion[];
  simulacion_disponible: boolean;
}
export interface EventoPagoSuscripcion {
  evento_id: string;
  suscripcion_id: number;
  monto_clp: number;
  metodo_pago_ref?: string;
}

export type Rol = 'TECNICO' | 'SUPERVISOR' | 'TRABAJADOR' | 'BODEGA' | 'JEFATURA';

declare const codigoEquipo: unique symbol;
/** Solo se obtiene tras validar el patrón ^EQ-[0-9]{4}$. */
export type CodigoEquipo = string & { readonly [codigoEquipo]: true };

export type CriticidadEquipo = 'ALTA' | 'MEDIA' | 'BAJA';

export type EstadoEquipo = 'OPERATIVO' | 'EN_FALLA' | 'EN_MANTENCIÓN' | 'FUERA_DE_SERVICIO';

export interface LoginSolicitud { rut: string; password: string }
export interface UsuarioSesion {
  id: number;
  rut: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  tenant_id: number;
  plan: PlanTenant;
  sede_id?: number;
}
export interface UsuarioSede {
  id: number;
  nombre: string;
  rol: Rol;
  sede_id: number | null;
}
export interface UsuarioSedeSolicitud { sede_id: number | null }
export interface RegistroSolicitud extends LoginSolicitud { nombre: string; rol: Rol; nombre_empresa?: string }
export interface LoginRespuesta { token: string; usuario: UsuarioSesion; expiraEn: number }
export type CodigoError = 'RUT_INVALIDO' | 'CREDENCIALES_INVALIDAS' | 'USUARIO_INACTIVO'
  | 'DEMASIADOS_INTENTOS' | 'DATOS_INVALIDOS' | 'NO_AUTORIZADO' | 'SIN_PERMISO'
  | 'CODIGO_FORMATO_INVALIDO' | 'CODIGO_DUPLICADO' | 'ACTIVO_NO_ENCONTRADO' | 'RUT_DUPLICADO'
  | 'FALLA_NO_ENCONTRADA' | 'ORDEN_DUPLICADA' | 'TECNICO_NO_DISPONIBLE'
  | 'ORDEN_NO_ENCONTRADA' | 'TRANSICION_ORDEN_INVALIDA' | 'ORDEN_YA_CERRADA'
  | 'REPUESTO_NO_ENCONTRADO' | 'REPUESTO_CON_STOCK' | 'STOCK_INSUFICIENTE'
  | 'FOTO_NO_ENCONTRADA' | 'NOTIFICACION_NO_ENCONTRADA'
  | 'CUPO_EQUIPOS_ALCANZADO' | 'PLAN_EMPRESA_REQUERIDO'
  | 'SEDE_NO_ENCONTRADA' | 'SEDE_DUPLICADA' | 'SEDE_EN_USO' | 'PREVENTIVO_NO_ENCONTRADO'
  | 'CHECKOUT_PENDIENTE' | 'PLAN_YA_ACTIVO' | 'SUSCRIPCION_NO_ENCONTRADA' | 'SIMULACION_PAGO_DESACTIVADA'
  | 'ESTADO_SUSCRIPCION_INVALIDO' | 'FIRMA_PAGO_INVALIDA' | 'MONTO_PAGO_INVALIDO'
  | 'EVENTO_PAGO_CONFLICTO' | 'PAGOS_NO_CONFIGURADOS' | 'USUARIO_NO_ENCONTRADO'
  | 'CLAVE_ERP_INVALIDA' | 'CLAVE_ERP_REQUERIDA' | 'INTEGRACION_ERP_INACTIVA' | 'REFERENCIA_ERP_CONFLICTO';
export interface ErrorRespuesta { codigo: CodigoError; mensaje: string }

export interface ActivoCrearSolicitud {
  codigo: CodigoEquipo;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  ubicacion: string;
  criticidad: CriticidadEquipo;
  sede_id?: number | null;
}
export interface ActivoActualizarSolicitud {
  nombre?: string;
  marca?: string | null;
  modelo?: string | null;
  ubicacion?: string;
  criticidad?: CriticidadEquipo;
  uso_acumulado_horas?: number;
  sede_id?: number | null;
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
  sede_id?: number;
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

export interface OrdenRespuesta extends Omit<OrdenCrearSolicitud, 'falla_id'> {
  id: number;
  falla_id: number | null;
  plan_preventivo_id?: number;
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

export type TipoDisparadorPreventivo = 'FECHA' | 'HORAS_USO';

type ConfiguracionPreventiva =
  | { tipo_disparador: 'FECHA'; intervalo_dias: number; proxima_fecha: string; intervalo_horas?: never; proximas_horas?: never }
  | { tipo_disparador: 'HORAS_USO'; intervalo_horas: number; proximas_horas: number; intervalo_dias?: never; proxima_fecha?: never };

export type PlanPreventivoCrearSolicitud = ConfiguracionPreventiva & {
  equipo_id: number;
  tecnico_id: number;
  descripcion: string;
};

export interface PlanPreventivoActualizarSolicitud { activo: boolean }

export interface PlanPreventivoRespuesta {
  id: number;
  equipo_id: number;
  equipo_codigo: CodigoEquipo;
  equipo_nombre: string;
  tecnico_id: number;
  descripcion: string;
  tipo_disparador: TipoDisparadorPreventivo;
  intervalo_dias: number | null;
  intervalo_horas: number | null;
  proxima_fecha: string | null;
  proximas_horas: number | null;
  activo: boolean;
  orden_abierta_id: number | null;
  alerta_vencimiento: boolean;
}

export interface EvaluacionPreventivosRespuesta { generadas: number; ordenes_ids: number[] }

export type FallaHistorialEquipo = Pick<FallaRespuesta, 'id' | 'descripcion' | 'prioridad' | 'fecha_reporte'>;

export interface OrdenHistorialEquipo extends Pick<OrdenRespuesta, 'id' | 'estado' | 'fecha_limite'> {
  creada_en: string | null;
  iniciada_en: string | null;
  cerrada_en: string | null;
}

export type IntervencionHistorialEquipo = Omit<IntervencionRespuesta, 'orden_id' | 'autor_id'>;

export interface RegistroHistorialEquipo {
  actividad_en: string;
  falla: FallaHistorialEquipo;
  orden: OrdenHistorialEquipo | null;
  intervencion: IntervencionHistorialEquipo | null;
}

export interface ConsultaHistorialEquipo { page: number; size: number }
export interface HistorialEquipo extends ConsultaHistorialEquipo {
  items: RegistroHistorialEquipo[];
  total: number;
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
  costo_unitario_clp?: number | null;
}

export interface RepuestoCrearSolicitud extends RepuestoActualizarSolicitud { codigo: string }

export interface RepuestoRespuesta {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario_clp?: number | null;
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

export interface FallaRecurrente {
  equipo_id: number;
  equipo_codigo: CodigoEquipo;
  equipo_nombre: string;
  total: number;
}

export interface MetricasDashboardBase {
  ordenes_abiertas: number;
  ordenes_vencidas: number;
  mttr_minutos: number | null;
  fallas_recurrentes: FallaRecurrente[];
  cumplimiento_preventivo_pct: number | null;
  preventivas_en_plazo: number;
  preventivas_evaluadas: number;
}

export interface MetricasSede {
  sede_id: number | null;
  nombre: string;
  metricas: MetricasDashboardBase;
}
export interface MetricasDashboard extends MetricasDashboardBase { por_sede?: MetricasSede[] }

export interface IntegracionERPSolicitud { webhook_url: string | null; activo: boolean }
export interface IntegracionERPRespuesta extends IntegracionERPSolicitud { clave_configurada: boolean }
export interface ClaveERP { api_key: string }
export interface StockERP { codigo: string; stock_actual: number }
export interface CostoERP extends StockERP { nombre: string; costo_unitario_clp: number | null }
export interface PaginaCostosERP { items: CostoERP[]; total: number; page: number; size: number }
export interface SyncStockERPSolicitud { referencia: string; items: StockERP[] }
export interface SyncStockERPRespuesta { referencia: string; actualizados: number }
