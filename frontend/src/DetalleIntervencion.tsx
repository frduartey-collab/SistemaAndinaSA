import { useEffect, useState } from 'react'
import type { OrdenDetalleRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { mensajeError } from './api'

type Carga =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; orden: OrdenDetalleRespuesta }

type Props = {
  id: number
  ordenInicial?: OrdenDetalleRespuesta
  aviso?: string
  alCerrar: () => void
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short',
})

export function DetalleIntervencion({ id, ordenInicial, aviso, alCerrar }: Props) {
  const { solicitar } = useAuth()
  const [carga, setCarga] = useState<Carga>(
    ordenInicial ? { tipo: 'lista', orden: ordenInicial } : { tipo: 'cargando' },
  )
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (ordenInicial) return

    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<OrdenDetalleRespuesta>(`/ordenes/${id}`, { signal })
      .then((orden) => {
        if (!signal.aborted) setCarga({ tipo: 'lista', orden })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setCarga({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudo cargar la intervención.'),
        })
      })

    return () => controlador.abort()
  }, [id, intento, ordenInicial, solicitar])

  return (
    <Dialogo titulo={'Intervención · Orden #' + id} amplio alCerrar={alCerrar}>
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {carga.tipo === 'cargando' && <p role="status">Cargando intervención…</p>}
      {carga.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{carga.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setCarga({ tipo: 'cargando' })
            setIntento((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar</button>
        </div>
      )}
      {carga.tipo === 'lista' && <Resumen orden={carga.orden} />}
      <div className="dialogo-acciones">
        <button className="boton boton-secundario" type="button" onClick={alCerrar}>Volver a órdenes</button>
      </div>
    </Dialogo>
  )
}

function Resumen({ orden }: { orden: OrdenDetalleRespuesta }) {
  const { intervencion } = orden

  return (
    <>
      <div className="orden-cabecera">
        <p className="nombre-detalle">{orden.equipo_codigo} · {orden.equipo_nombre}</p>
        {orden.estado === 'CERRADA' && (
          <span className="insignia orden-cerrada"><Icono nombre="completar" />Cerrada</span>
        )}
      </div>
      {intervencion ? (
        <dl className="datos-detalle intervencion-datos">
          <div>
            <dt>Registrada por</dt>
            <dd>{intervencion.autor_id === orden.tecnico_id ? orden.tecnico_nombre : 'Usuario #' + intervencion.autor_id}</dd>
          </div>
          <div>
            <dt>Fecha de registro</dt>
            <dd><time dateTime={intervencion.registrada_en}>{FORMATO_FECHA.format(new Date(intervencion.registrada_en))}</time></dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{intervencion.duracion_minutos} {intervencion.duracion_minutos === 1 ? 'minuto' : 'minutos'}</dd>
          </div>
          <div className="intervencion-texto">
            <dt>Diagnóstico</dt>
            <dd>{intervencion.diagnostico}</dd>
          </div>
          <div className="intervencion-texto">
            <dt>Solución</dt>
            <dd>{intervencion.solucion}</dd>
          </div>
          <div className="intervencion-texto">
            <dt>Repuestos consumidos</dt>
            <dd>
              {intervencion.repuestos_consumidos.length > 0 ? (
                <ul className="resumen-consumos">
                  {intervencion.repuestos_consumidos.map((repuesto) => (
                    <li key={repuesto.repuesto_id}>
                      <strong>{repuesto.codigo}</strong> · {repuesto.nombre} · {repuesto.cantidad} {repuesto.cantidad === 1 ? 'unidad' : 'unidades'}
                    </li>
                  ))}
                </ul>
              ) : 'Sin consumos de inventario registrados.'}
            </dd>
          </div>
          {intervencion.repuestos_usados && (
            <div className="intervencion-texto">
              <dt>Notas de repuestos anteriores</dt>
              <dd>{intervencion.repuestos_usados}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="intervencion-ausente">
          {orden.estado === 'CERRADA' ? 'Cerrada antes del registro de intervenciones.' : 'La orden aún no tiene una intervención registrada.'}
        </p>
      )}
    </>
  )
}
