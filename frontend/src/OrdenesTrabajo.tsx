import { Icono } from './Icono'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { EstadoOrden, FallaRespuesta, OrdenEstadoSolicitud, OrdenRespuesta, PaginaOrdenes } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { CrearOrden } from './CrearOrden'
import { Dialogo } from './Dialogo'
import { mensajeError } from './api'

type Vista =
  | { tipo: 'cargando'; datos?: PaginaOrdenes }
  | { tipo: 'error'; mensaje: string; datos?: PaginaOrdenes }
  | { tipo: 'lista'; datos: PaginaOrdenes }

const ICONOS_ESTADO = { PENDIENTE: 'pendiente', EN_PROGRESO: 'progreso', CERRADA: 'completar' } as const
const ESTADOS: Record<EstadoOrden, string> = {
  PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', CERRADA: 'Cerrada',
}
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', dateStyle: 'medium' })
const TAMANO = 20

export function OrdenesTrabajo() {
  const { solicitar, puedeEscribir } = useAuth()
  const { state } = useLocation()
  const navigate = useNavigate()
  const fallaNavegacion = (state as { falla?: FallaRespuesta } | null)?.falla
  const fallaInicial = puedeEscribir && fallaNavegacion && Number.isSafeInteger(fallaNavegacion.id) ? fallaNavegacion : null
  const [creando, setCreando] = useState(Boolean(fallaInicial))
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const [confirmacion, setConfirmacion] = useState<OrdenRespuesta | null>(null)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorCambio, setErrorCambio] = useState('')
  const { datos } = vista

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<PaginaOrdenes>(`/ordenes?page=${page}&size=${TAMANO}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos, mensaje: mensajeError(fallo, 'No se pudieron cargar las órdenes.'),
        }))
      })
    return () => controlador.abort()
  }, [page, revision, solicitar])

  function cerrarCreacion() {
    setCreando(false)
    if (fallaInicial) navigate('/ordenes', { replace: true, state: null })
  }

  function ordenCreada(orden: OrdenRespuesta) {
    cerrarCreacion()
    setAviso('Orden #' + orden.id + ' creada y asignada a ' + orden.tecnico_nombre + '.')
    setVista((anterior) => ({ tipo: 'cargando', datos: anterior.datos }))
    setPage(1)
    setRevision((anterior) => anterior + 1)
  }

  async function cambiarEstado(orden: OrdenRespuesta, estado: OrdenEstadoSolicitud['estado']) {
    if (cambiando !== null) return
    setAviso('')
    setErrorCambio('')
    setCambiando(orden.id)
    const body: OrdenEstadoSolicitud = { estado }
    try {
      const actualizada = await solicitar<OrdenRespuesta>(`/ordenes/${orden.id}/estado`, {
        method: 'PATCH', body: JSON.stringify(body),
      })
      setVista((anterior) => {
        if (!anterior.datos) return anterior
        const items = anterior.datos.items.map((item) => item.id === orden.id ? actualizada : item)
        return { ...anterior, datos: { ...anterior.datos, items } }
      })
      setConfirmacion(null)
      setAviso('Orden #' + orden.id + ' actualizada: ' + ESTADOS[actualizada.estado] + '.')
    } catch (fallo) {
      setErrorCambio(mensajeError(fallo, 'No se pudo cambiar el estado. Intenta nuevamente.'))
    } finally {
      setCambiando(null)
    }
  }

  function cargarPagina(nueva: number) {
    setVista({ tipo: 'cargando', datos })
    setPage(nueva)
  }

  const paginas = Math.max(1, Math.ceil((datos?.total ?? 0) / TAMANO))
  return (
    <>
      <div className="encabezado-pagina">
        <h1>{puedeEscribir ? 'Órdenes de trabajo' : 'Mis órdenes de trabajo'}</h1>
        {puedeEscribir && (
          <button className="boton boton-primario" type="button" onClick={() => { setAviso(''); setCreando(true) }}>
            <Icono nombre="ordenNueva" />
            Crear orden
          </button>
        )}
      </div>

      {aviso && <p className="aviso aviso-exito" role="status">{aviso}</p>}
      {errorCambio && !confirmacion && <p className="aviso aviso-error" role="alert">{errorCambio}</p>}
      <section className="panel lista-ordenes" aria-label="Listado de órdenes" aria-busy={vista.tipo === 'cargando'}>
        {vista.tipo === 'cargando' && <p role="status">Cargando órdenes…</p>}
        {vista.tipo === 'error' && (
          <div className="aviso aviso-error">
            <p role="alert">{vista.mensaje}</p>
            <button type="button" className="boton boton-secundario" onClick={() => {
              setVista({ tipo: 'cargando', datos })
              setRevision((anterior) => anterior + 1)
            }}><Icono nombre="sincronizar" />Reintentar</button>
          </div>
        )}
        {datos && (
          <>
            <p className="ayuda" role="status">{datos.total === 1 ? '1 orden' : datos.total + ' órdenes'}</p>
            {vista.tipo === 'lista' && datos.items.length === 0 && (
              <p className="ayuda">{puedeEscribir ? 'Aún no hay órdenes de trabajo.' : 'Aún no tienes órdenes asignadas.'}</p>
            )}
            <ul className="ordenes-resultados">
              {datos.items.map((orden) => (
                <li className="orden" key={orden.id}>
                  <div className="orden-cabecera">
                    <div>
                      <p className="ayuda">Orden #{orden.id} · Falla #{orden.falla_id}</p>
                      <h2>{orden.equipo_codigo} · {orden.equipo_nombre}</h2>
                    </div>
                    <span className={'insignia orden-' + orden.estado.toLowerCase()}><Icono nombre={ICONOS_ESTADO[orden.estado]} />{ESTADOS[orden.estado]}</span>
                  </div>
                  <p className="descripcion-falla">{orden.descripcion}</p>
                  <dl className="orden-datos">
                    {puedeEscribir && <div><dt>Técnico</dt><dd>{orden.tecnico_nombre}</dd></div>}
                    <div><dt>Prioridad de la falla</dt><dd>{orden.prioridad}</dd></div>
                    <div><dt>Fecha límite</dt><dd><time dateTime={orden.fecha_limite}>
                      {FORMATO_FECHA.format(new Date(orden.fecha_limite + 'T00:00:00Z'))}
                    </time></dd></div>
                  </dl>
                  {orden.estado === 'PENDIENTE' && (
                    <button className="boton boton-primario" type="button" aria-label={'Iniciar orden #' + orden.id}
                      disabled={vista.tipo === 'cargando' || cambiando !== null}
                      onClick={() => cambiarEstado(orden, 'EN_PROGRESO')}>
                      <Icono nombre="iniciar" />
                      {cambiando === orden.id ? 'Actualizando…' : 'Iniciar trabajo'}
                    </button>
                  )}
                  {orden.estado === 'EN_PROGRESO' && (
                    <button className="boton boton-secundario" type="button" aria-label={'Cerrar orden #' + orden.id}
                      disabled={vista.tipo === 'cargando' || cambiando !== null}
                      onClick={() => { setErrorCambio(''); setConfirmacion(orden) }}><Icono nombre="completar" />Cerrar orden</button>
                  )}
                </li>
              ))}
            </ul>
            {paginas > 1 && (
              <nav className="paginacion" aria-label="Paginación de órdenes">
                <p>Página {datos.page} de {paginas}</p>
                <div>
                  <button type="button" className="boton boton-secundario"
                    disabled={vista.tipo !== 'lista' || cambiando !== null || page <= 1}
                    onClick={() => cargarPagina(page - 1)}><Icono nombre="anterior" />Anterior</button>
                  <button type="button" className="boton boton-secundario"
                    disabled={vista.tipo !== 'lista' || cambiando !== null || page >= paginas}
                    onClick={() => cargarPagina(page + 1)}><Icono nombre="siguiente" />Siguiente</button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>

      {puedeEscribir && creando && <CrearOrden fallaInicial={fallaInicial} alCerrar={cerrarCreacion} alGuardar={ordenCreada} />}
      {confirmacion && (
        <Dialogo titulo={'Cerrar orden #' + confirmacion.id} ocupado={cambiando !== null}
          alCerrar={() => { setConfirmacion(null); setErrorCambio('') }}>
          <p>¿Confirmas que terminó el trabajo en {confirmacion.equipo_codigo}?</p>
          {errorCambio && <p role="alert" className="aviso aviso-error">{errorCambio}</p>}
          <div className="dialogo-acciones">
            <button type="button" className="boton boton-secundario" disabled={cambiando !== null}
              onClick={() => { setConfirmacion(null); setErrorCambio('') }}>Cancelar</button>
            <button type="button" className="boton boton-primario" disabled={cambiando !== null}
              onClick={() => cambiarEstado(confirmacion, 'CERRADA')}>
              <Icono nombre="completar" />
              {cambiando !== null ? 'Cerrando…' : 'Confirmar cierre'}
            </button>
          </div>
        </Dialogo>
      )}
    </>
  )
}
