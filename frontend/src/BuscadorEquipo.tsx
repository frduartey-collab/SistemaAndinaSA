import { Icono } from './Icono'
import { useEffect, useRef, useState } from 'react'
import type { ActivoRespuesta, PaginaActivos } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { mensajeError } from './api'

type EstadoBusqueda =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; equipos: ActivoRespuesta[] }

type Props = {
  equipo: ActivoRespuesta | null
  alElegir: (equipo: ActivoRespuesta | null) => void
}

export function BuscadorEquipo({ equipo, alElegir }: Props) {
  const { solicitar } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [reintento, setReintento] = useState(0)
  const [estado, setEstado] = useState<EstadoBusqueda>({ tipo: 'cargando' })
  const campo = useRef<HTMLInputElement>(null)
  const enfocar = useRef(false)

  useEffect(() => {
    if (equipo) return
    if (enfocar.current) {
      campo.current?.focus()
      enfocar.current = false
    }
    const controlador = new AbortController()
    const { signal } = controlador
    const temporizador = window.setTimeout(async () => {
      const params = new URLSearchParams({ size: '8' })
      if (busqueda.trim()) params.set('q', busqueda.trim())

      try {
        const pagina = await solicitar<PaginaActivos>(`/activos?${params.toString()}`, { signal })
        if (!signal.aborted) setEstado({ tipo: 'lista', equipos: pagina.items })
      } catch (fallo) {
        if (!signal.aborted) setEstado({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudieron buscar equipos.'),
        })
      }
    }, 250)

    return () => {
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [equipo, busqueda, reintento, solicitar])

  if (equipo) {
    return (
      <div className="equipo-elegido">
        <div>
          <strong>{equipo.codigo} · {equipo.nombre}</strong>
          <p className="ayuda">{equipo.ubicacion} · Criticidad {equipo.criticidad}</p>
        </div>
        <button className="boton boton-secundario" type="button" onClick={() => {
          enfocar.current = true
          setEstado({ tipo: 'cargando' })
          alElegir(null)
        }}><Icono nombre="cambiar" />Cambiar equipo</button>
      </div>
    )
  }

  return (
    <div className="campo">
      <label htmlFor="falla-equipo">Buscar equipo por código o nombre</label>
      <input id="falla-equipo" ref={campo} type="search" maxLength={120} value={busqueda}
        onChange={(evento) => {
          setEstado({ tipo: 'cargando' })
          setBusqueda(evento.target.value)
        }} />
      {estado.tipo === 'cargando' && <p className="ayuda" role="status">Buscando equipos…</p>}
      {estado.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{estado.mensaje}</p>
          <button type="button" className="boton boton-secundario" onClick={() => {
            setEstado({ tipo: 'cargando' })
            setReintento((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar búsqueda</button>
        </div>
      )}
      {estado.tipo === 'lista' && (
        estado.equipos.length ? (
          <ul className="opciones-equipo" aria-label="Equipos disponibles">
            {estado.equipos.map((resultado) => (
              <li key={resultado.id}>
                <button className="opcion-equipo" type="button" onClick={() => alElegir(resultado)}>
                  <strong>{resultado.codigo} · {resultado.nombre}</strong>
                  <span>{resultado.ubicacion} · Criticidad {resultado.criticidad}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="ayuda" role="status">No se encontraron equipos vigentes.</p>
      )}
    </div>
  )
}
