import { createContext, useContext } from 'react'
import type { LoginSolicitud, UsuarioSesion } from '../../backend/src/dominio'
import type { llamarApi } from './api'

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
  puedeLeer: boolean
  puedeEscribir: boolean
  iniciarSesion: (datos: LoginSolicitud) => Promise<void>
  cerrarSesion: () => Promise<void>
  reintentar: () => void
  solicitar: <T>(ruta: RutaApi, opciones?: RequestInit) => Promise<T>
}

export const AuthContext = createContext<DatosAuth | null>(null)

export function useAuth() {
  const contexto = useContext(AuthContext)

  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return contexto
}

