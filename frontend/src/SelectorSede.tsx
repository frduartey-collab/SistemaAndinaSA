import { useEffect, useState } from 'react'
import type { SedeRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { mensajeError } from './api'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; sedes: SedeRespuesta[] }

export function SelectorSede({ valor, alCambiar, fija = false, id = 'equipo-sede', etiqueta = 'Sede',
  ninguna = 'Sin sede asignada' }: {
  valor: string; alCambiar: (valor: string) => void; fija?: boolean; id?: string; etiqueta?: string; ninguna?: string
}) {
  const { solicitar } = useAuth()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [revision, setRevision] = useState(0)
  const sedes = estado.tipo === 'lista' ? estado.sedes.filter((sede) => !fija || String(sede.id) === valor) : []
  const faltaSede = Boolean(valor) && !sedes.some((sede) => String(sede.id) === valor)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador

    solicitar<SedeRespuesta[]>('/sedes', { signal })
      .then((sedes) => {
        if (!signal.aborted) setEstado({ tipo: 'lista', sedes })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setEstado({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudieron cargar las sedes.'),
        })
      })

    return () => controlador.abort()
  }, [revision, solicitar])

  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} name="sede" value={valor} disabled={fija || estado.tipo !== 'lista'}
        onChange={(evento) => alCambiar(evento.target.value)}>
        {!fija && <option value="">{ninguna}</option>}
        {faltaSede && <option value={valor}>Sede #{valor}</option>}
        {sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}
      </select>
      {estado.tipo === 'cargando' && <p className="ayuda" role="status">Cargando sedes…</p>}
      {estado.tipo === 'lista' && sedes.length === 0 && <p className="ayuda">Aún no hay sedes registradas.</p>}
      {estado.tipo === 'error' && (
        <>
          <p className="error-campo" role="alert">{estado.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setEstado({ tipo: 'cargando' })
            setRevision((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar sedes</button>
        </>
      )}
    </div>
  )
}
