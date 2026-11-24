import { createContext, useContext } from 'react'
import type { LoginSolicitud, PlanTenant, UsuarioSesion } from '../../backend/src/dominio'
import type { llamarApi, OpcionesApi } from './api'

export type SesionGuardada = {
  token: string
  venceEn: number
}

export type EstadoSesion =
  | { tipo: 'comprobando' }
  | { tipo: 'sin-sesion'; aviso?: string }
  | { tipo: 'error' }
  | { tipo: 'activa'; sesion: SesionGuardada; usuario: UsuarioSesion }

export type RutaApi = Parameters<typeof llamarApi>[0]

type DatosAuth = {
  estado: EstadoSesion
  plan: PlanTenant | null
  puedeLeer: boolean
  puedeEscribir: boolean
  iniciarSesion: (datos: LoginSolicitud) => Promise<void>
  cerrarSesion: () => Promise<void>
  reintentar: () => void
  actualizarUsuario: () => Promise<void>
  solicitar: <T>(ruta: RutaApi, opciones?: OpcionesApi) => Promise<T>
}

export const AuthContext = createContext<DatosAuth | null>(null)

export function useAuth() {
  const contexto = useContext(AuthContext)

  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return contexto
}

