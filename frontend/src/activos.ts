import type { CriticidadEquipo, EstadoEquipo, Rol } from '../../backend/src/dominio'

export const criticidades = ['ALTA', 'MEDIA', 'BAJA'] as const satisfies readonly CriticidadEquipo[]
export const estados = ['OPERATIVO', 'EN_FALLA', 'EN_MANTENCIÓN', 'FUERA_DE_SERVICIO'] as const satisfies readonly EstadoEquipo[]

export const etiquetasEstado: Record<EstadoEquipo, string> = {
  OPERATIVO: 'Operativo',
  EN_FALLA: 'En falla',
  'EN_MANTENCIÓN': 'En mantención',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
}

export const etiquetasRol: Record<Rol, string> = {
  SUPERVISOR: 'Supervisor',
  JEFATURA: 'Jefatura',
  TECNICO: 'Técnico',
  TRABAJADOR: 'Trabajador',
  BODEGA: 'Bodega',
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 4 })
const formatoFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })

export function mostrarHoras(horas: number) {
  return formatoHoras.format(horas) + ' h'
}

export function mostrarFecha(fecha: string) {
  const fechaInterpretada = new Date(fecha)
  return Number.isNaN(fechaInterpretada.getTime()) ? 'Fecha no disponible' : formatoFecha.format(fechaInterpretada)
}

