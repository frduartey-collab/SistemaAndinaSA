import { Icono } from './Icono'
import { useEffect, useState } from 'react'
import type { ActivoRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { etiquetasEstado, mostrarFecha, mostrarHoras } from './activos'
import { mensajeError } from './api'

type PropsDetalle = {
  id: number
  codigo: string
  alCerrar: () => void
  alEditar?: (equipo: ActivoRespuesta) => void
}

type EstadoDetalle =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; equipo: ActivoRespuesta }

export function DetalleEquipo({ id, codigo, alCerrar, alEditar }: PropsDetalle) {
  const { solicitar } = useAuth()
  const [estado, setEstado] = useState<EstadoDetalle>({ tipo: 'cargando' })
  const [reintentos, setReintentos] = useState(0)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<ActivoRespuesta>(`/activos/${id}`, { signal })
      .then((equipo) => {
        if (!signal.aborted) setEstado({ tipo: 'listo', equipo })
      })
      .catch((error: unknown) => {
        if (!signal.aborted) {
          setEstado({ tipo: 'error', mensaje: mensajeError(error, 'No se pudo consultar el equipo.') })
        }
      })

    return () => controlador.abort()
  }, [id, solicitar, reintentos])

  function reintentar() {
    setEstado({ tipo: 'cargando' })
    setReintentos((valor) => valor + 1)
  }

  return (
    <Dialogo titulo={'Equipo ' + codigo} alCerrar={alCerrar}>
      {estado.tipo === 'cargando' && <p role="status">Cargando datos del equipo…</p>}
      {estado.tipo === 'error' && (
        <>
          <p className="aviso aviso-error" role="alert">{estado.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={reintentar}><Icono nombre="sincronizar" />Reintentar</button>
        </>
      )}
      {estado.tipo === 'listo' && (
        <>
          <p className="nombre-detalle">{estado.equipo.nombre}</p>
          <dl className="datos-detalle">
            <div><dt>Marca</dt><dd>{estado.equipo.marca || 'Sin marca'}</dd></div>
            <div><dt>Modelo</dt><dd>{estado.equipo.modelo || 'Sin modelo'}</dd></div>
            <div><dt>Ubicación</dt><dd>{estado.equipo.ubicacion}</dd></div>
            <div><dt>Criticidad</dt><dd>{estado.equipo.criticidad}</dd></div>
            <div><dt>Estado</dt><dd>{etiquetasEstado[estado.equipo.estado]}</dd></div>
            <div><dt>Horas acumuladas</dt><dd>{mostrarHoras(estado.equipo.uso_acumulado_horas)}</dd></div>
            <div><dt>Fecha de alta</dt><dd>{mostrarFecha(estado.equipo.fecha_alta)}</dd></div>
          </dl>
          <div className="dialogo-acciones">
            <button className="boton boton-secundario" type="button" onClick={alCerrar}><Icono nombre="cerrar" />Cerrar</button>
            {alEditar && (
              <button className="boton boton-primario" type="button" onClick={() => alEditar(estado.equipo)}><Icono nombre="editar" />Editar equipo</button>
            )}
          </div>
        </>
      )}
    </Dialogo>
  )
}

