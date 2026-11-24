import { useEffect, useId, useRef, useState } from 'react'
import type { EstadoOrden, HistorialEquipo, RegistroHistorialEquipo } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { mensajeError } from './api'

const TAMANO = 5
const FECHA_HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short',
})
const FECHA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC', dateStyle: 'medium',
})
const ESTADOS: Record<EstadoOrden, string> = {
  PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', CERRADA: 'Cerrada',
}

type Vista =
  | { tipo: 'cargando'; datos?: HistorialEquipo }
  | { tipo: 'error'; mensaje: string; datos?: HistorialEquipo }
  | { tipo: 'lista'; datos: HistorialEquipo }

export function HistorialMantenimiento({ equipoId }: { equipoId: number }) {
  const { solicitar } = useAuth()
  const tituloId = useId()
  const encabezado = useRef<HTMLHeadingElement>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const { datos } = vista
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.size)) : 1

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador

    solicitar<HistorialEquipo>(`/equipos/${equipoId}/historial?page=${page}&size=${TAMANO}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos,
          mensaje: mensajeError(fallo, 'No se pudo cargar el historial de mantenimiento.'),
        }))
      })

    return () => controlador.abort()
  }, [equipoId, page, revision, solicitar])

  function cambiarPagina(nueva: number) {
    setVista({ tipo: 'cargando', datos })
    setPage(nueva)
    encabezado.current?.focus()
  }

  function reintentar() {
    setVista({ tipo: 'cargando', datos })
    setRevision((anterior) => anterior + 1)
    encabezado.current?.focus()
  }

  return (
    <section className="historial-equipo" aria-labelledby={tituloId}>
      <h3 id={tituloId} tabIndex={-1} ref={encabezado}>Historial de mantenimiento</h3>
      {vista.tipo === 'cargando' && <p className="ayuda" role="status">Cargando historial…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={reintentar}>
            <Icono nombre="sincronizar" />Reintentar historial
          </button>
        </div>
      )}
      {vista.tipo === 'lista' && datos?.items.length === 0 && (
        <p className="ayuda" role="status">Aún no hay fallas reportadas para este equipo.</p>
      )}
      {datos && datos.items.length > 0 && (
        <>
          <p className="ayuda" role="status">{datos.total === 1 ? '1 falla registrada' : datos.total + ' fallas registradas'}</p>
          <ol className="historial-registros" aria-busy={vista.tipo === 'cargando'}>
            {datos.items.map((registro) => <Registro key={registro.falla.id} datos={registro} />)}
          </ol>
          {paginas > 1 && (
            <nav className="paginacion historial-paginacion" aria-label="Paginación del historial">
              <p>Página {datos.page} de {paginas}</p>
              <div>
                <button className="boton boton-secundario" type="button"
                  disabled={vista.tipo !== 'lista' || datos.page <= 1}
                  onClick={() => cambiarPagina(datos.page - 1)}><Icono nombre="anterior" />Anterior</button>
                <button className="boton boton-secundario" type="button"
                  disabled={vista.tipo !== 'lista' || datos.page >= paginas}
                  onClick={() => cambiarPagina(datos.page + 1)}><Icono nombre="siguiente" />Siguiente</button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

function FechaRegistrada({ fecha, soloDia = false }: { fecha: string | null; soloDia?: boolean }) {
  if (!fecha) return <>Sin fecha registrada</>
  const valor = new Date(fecha)
  if (Number.isNaN(valor.getTime())) return <>Sin fecha registrada</>
  return <time dateTime={fecha}>{(soloDia ? FECHA : FECHA_HORA).format(valor)}</time>
}

function Registro({ datos }: { datos: RegistroHistorialEquipo }) {
  const { falla, orden, intervencion } = datos

  return (
    <li className="historial-registro">
      <div className="reporte-cabecera">
        <h4>Falla #{falla.id}</h4>
        <span className={'insignia criticidad-' + falla.prioridad.toLowerCase()}>Prioridad {falla.prioridad}</span>
      </div>
      <p className="ayuda">Reportada · <FechaRegistrada fecha={falla.fecha_reporte} /></p>
      {datos.actividad_en !== falla.fecha_reporte && (
        <p className="ayuda">Última actividad · <FechaRegistrada fecha={datos.actividad_en} /></p>
      )}
      <p className="descripcion-falla">{falla.descripcion}</p>
      {orden ? (
        <section className="historial-evento">
          <div className="reporte-cabecera">
            <h5>Orden #{orden.id}</h5>
            <span className={'insignia orden-' + orden.estado.toLowerCase()}>{ESTADOS[orden.estado]}</span>
          </div>
          <dl className="datos-detalle historial-datos">
            <div><dt>Fecha límite</dt><dd><FechaRegistrada fecha={orden.fecha_limite} soloDia /></dd></div>
            <div><dt>Creación de la orden</dt><dd><FechaRegistrada fecha={orden.creada_en} /></dd></div>
            <div><dt>Inicio de la orden</dt><dd><FechaRegistrada fecha={orden.iniciada_en} /></dd></div>
            <div><dt>Cierre de la orden</dt><dd><FechaRegistrada fecha={orden.cerrada_en} /></dd></div>
          </dl>
        </section>
      ) : <p className="historial-evento ayuda">Sin orden de trabajo.</p>}
      {intervencion ? (
        <section className="historial-evento">
          <h5>Intervención</h5>
          <dl className="datos-detalle historial-datos">
            <div><dt>Fecha de registro</dt><dd><FechaRegistrada fecha={intervencion.registrada_en} /></dd></div>
            <div><dt>Duración</dt><dd>{intervencion.duracion_minutos} min</dd></div>
            {intervencion.diagnostico && (
              <div className="intervencion-texto"><dt>Diagnóstico</dt><dd>{intervencion.diagnostico}</dd></div>
            )}
            <div className="intervencion-texto"><dt>Solución</dt><dd>{intervencion.solucion}</dd></div>
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
              <div className="intervencion-texto"><dt>Notas de repuestos anteriores</dt><dd>{intervencion.repuestos_usados}</dd></div>
            )}
          </dl>
        </section>
      ) : orden && (
        <p className="historial-evento ayuda">
          {orden.estado === 'CERRADA' ? 'Cerrada antes del registro de intervenciones.' : 'Sin intervención registrada.'}
        </p>
      )}
    </li>
  )
}
