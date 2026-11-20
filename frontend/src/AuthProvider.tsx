import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LoginRespuesta, LoginSolicitud, UsuarioSesion } from '../../backend/src/dominio'
import { AuthContext, type EstadoSesion, type RutaApi, type SesionGuardada } from './AuthContext'
import { ErrorApi, llamarApi, type OpcionesApi } from './api'

const CLAVE_SESION = 'andina.sesion'
const AVISO_VENCIDA = 'Tu sesión ya no está activa. Ingresa nuevamente.'

function leerSesion(): SesionGuardada | null {
  try {
    const valor = sessionStorage.getItem(CLAVE_SESION)
    if (!valor) return null
    const sesion = JSON.parse(valor) as Partial<SesionGuardada> | null
    if (
      typeof sesion?.token !== 'string' || !sesion.token ||
      typeof sesion.venceEn !== 'number' || !Number.isFinite(sesion.venceEn) ||
      sesion.venceEn <= Date.now()
    ) return null

    return { token: sesion.token, venceEn: sesion.venceEn }
  } catch {
    return null
  }
}

function guardarSesion(sesion: SesionGuardada | null) {
  try {
    if (sesion) {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
    } else {
      sessionStorage.removeItem(CLAVE_SESION)
    }
  } catch {
    // La sesión permanece en memoria cuando el navegador restringe el almacenamiento.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [guardada] = useState(leerSesion)
  const [estado, setEstado] = useState<EstadoSesion>(
    guardada ? { tipo: 'comprobando' } : { tipo: 'sin-sesion' },
  )
  const [intento, setIntento] = useState(0)
  const tokenActual = useRef<string | null>(null)

  const activarSesion = useCallback((sesion: SesionGuardada, usuario: UsuarioSesion) => {
    tokenActual.current = sesion.token
    guardarSesion(sesion)
    setEstado({ tipo: 'activa', sesion, usuario })
  }, [])

  const descartarSesion = useCallback((aviso: string) => {
    tokenActual.current = null
    guardarSesion(null)
    setEstado({ tipo: 'sin-sesion', aviso })
  }, [])

  useEffect(() => {
    if (!guardada) return
    const controlador = new AbortController()
    const { signal } = controlador

    async function comprobar(sesion: SesionGuardada) {
      try {
        const usuario = await llamarApi<UsuarioSesion>('/auth/me', { signal }, sesion.token)
        if (signal.aborted) return
        if (sesion.venceEn <= Date.now()) {
          descartarSesion(AVISO_VENCIDA)
        } else {
          activarSesion(sesion, usuario)
        }
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof ErrorApi && error.estado === 401) {
          descartarSesion(AVISO_VENCIDA)
        } else {
          setEstado({ tipo: 'error' })
        }
      }
    }

    void comprobar(guardada)
    return () => controlador.abort()
  }, [guardada, intento, activarSesion, descartarSesion])

  useEffect(() => {
    if (estado.tipo !== 'activa') return
    const restante = Math.max(0, estado.sesion.venceEn - Date.now())
    const temporizador = window.setTimeout(() => {
      descartarSesion('Tu sesión venció. Ingresa nuevamente.')
    }, restante)

    return () => window.clearTimeout(temporizador)
  }, [estado, descartarSesion])

  async function iniciarSesion(datos: LoginSolicitud) {
    const { token, usuario, expiraEn } = await llamarApi<LoginRespuesta>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
    activarSesion({ token, venceEn: Date.now() + expiraEn * 1000 }, usuario)
  }

  const solicitar = useCallback(async <T,>(ruta: RutaApi, opciones?: OpcionesApi) => {
    const token = tokenActual.current
    if (!token) throw new ErrorApi(AVISO_VENCIDA, 401, 'NO_AUTORIZADO')

    try {
      return await llamarApi<T>(ruta, opciones, token)
    } catch (error) {
      if (
        !opciones?.signal?.aborted &&
        error instanceof ErrorApi && error.estado === 401 && tokenActual.current === token
      ) descartarSesion(AVISO_VENCIDA)

      throw error
    }
  }, [descartarSesion])

  async function cerrarSesion() {
    const token = tokenActual.current
    if (!token) return
    try {
      await llamarApi<void>('/auth/logout', { method: 'POST' }, token)
      if (tokenActual.current === token) descartarSesion('Sesión cerrada.')
    } catch (error) {
      if (!(error instanceof ErrorApi && error.estado === 401)) throw error
      if (tokenActual.current === token) descartarSesion(AVISO_VENCIDA)
    }
  }

  function reintentar() {
    setEstado({ tipo: 'comprobando' })
    setIntento((anterior) => anterior + 1)
  }

  const rol = estado.tipo === 'activa' ? estado.usuario.rol : null
  const plan = estado.tipo === 'activa' ? estado.usuario.plan : null
  const puedeEscribir = rol === 'SUPERVISOR' || rol === 'JEFATURA'
  const puedeLeer = puedeEscribir || rol === 'TECNICO' || rol === 'TRABAJADOR'

  return (
    <AuthContext.Provider value={{
      estado, plan, puedeLeer, puedeEscribir, iniciarSesion, cerrarSesion, reintentar, solicitar,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

