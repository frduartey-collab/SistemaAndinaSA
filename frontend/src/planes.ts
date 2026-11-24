import type { PlanTenant } from '../../backend/src/dominio'

export const PLANES = {
  PARTICULAR: { nombre: 'Particular', mensualidad: 54990, puestaEnMarcha: 0 },
  EMPRESA: { nombre: 'Empresa', mensualidad: 600000, puestaEnMarcha: 2500000 },
} as const

export const PESOS = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
})

export function leerPlan(parametros: URLSearchParams): PlanTenant | null {
  const [plan, ...otros] = parametros.getAll('plan')
  return otros.length === 0 && (plan === 'PARTICULAR' || plan === 'EMPRESA') ? plan : null
}

export function rutaConPlan(ruta: '/login' | '/registro' | '/suscripcion', plan: PlanTenant | null) {
  return plan ? ruta + '?plan=' + plan : ruta
}
