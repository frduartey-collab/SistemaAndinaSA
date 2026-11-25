import { Icono } from './Icono'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { EstadoOrden, FallaRespuesta, OrdenDetalleRespuesta, OrdenEstadoSolicitud, OrdenRespuesta, PaginaOrdenes } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { CerrarOrden } from './CerrarOrden'
import { CrearOrden } from './CrearOrden'
import { DetalleIntervencion } from './DetalleIntervencion'
import { mensajeError } from './api'

type Vista =
  | { tipo: 'cargando'; datos?: PaginaOrdenes }
  | { tipo: 'error'; mensaje: string; datos?: PaginaOrdenes }
  | { tipo: 'lista'; datos: PaginaOrdenes }

type DialogoOrden =
  | { tipo: 'cierre'; orden: OrdenRespuesta }
  | { tipo: 'detalle'; id: number; ordenInicial?: OrdenDetalleRespuesta; aviso?: string }

const ICONOS_ESTADO = { PENDIENTE: 'pendiente', EN_PROGRESO: 'progreso', CERRADA: 'completar' } as const
const ESTADOS: Record<EstadoOrden, string> = {
  PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', CERRADA: 'Cerrada',
}
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', dateStyle: 'medium' })
const TAMANO = 20

export function OrdenesTrabajo() {
  const { estado, solicitar, puedeEscribir } = useAuth()
  const usuario = estado.tipo === 'activa' ? estado.usuario : null
  const esTecnico = usuario?.rol === 'TECNICO'
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const soloAbiertas = esTecnico && !mostrarTodas
  const { state } = useLocation()
  const navigate = useNavigate()
  const fallaNavegacion = (state as { falla?: FallaRespuesta } | null)?.falla
  const fallaInicial = puedeEscribir && fallaNavegacion && Number.isSafeInteger(fallaNavegacion.id) ? fallaNavegacion : null
  const [creando, setCreando] = useState(Boolean(fallaInicial))
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const [dialogo, setDialogo] = useState<DialogoOrden | null>(null)
  const encabezado = useRef<HTMLHeadingElement>(null)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorCambio, setErrorCambio] = useState('')
  const { datos } = vista

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    const filtro = soloAbiertas ? '&solo_abiertas=true' : ''
    solicitar<PaginaOrdenes>(`/ordenes?page=${page}&size=${TAMANO}${filtro}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos, mensaje: mensajeError(fallo, 'No se pudieron cargar las órdenes.'),
        }))
      })
    return () => controlador.abort()
  }, [page, revision, solicitar, soloAbiertas])

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

  async function iniciarOrden(orden: OrdenRespuesta) {
    if (cambiando !== null) return
    setAviso('')
    setErrorCambio('')
    setCambiando(orden.id)
    const body: OrdenEstadoSolicitud = { estado: 'EN_PROGRESO' }
    try {
      const actualizada = await solicitar<OrdenRespuesta>(`/ordenes/${orden.id}/estado`, {
        method: 'PATCH', body: JSON.stringify(body),
      })
      setVista((anterior) => {
        if (!anterior.datos) return anterior
        const items = anterior.datos.items.map((item) => item.id === orden.id ? actualizada : item)
        return { ...anterior, datos: { ...anterior.datos, items } }
      })
      setAviso('Orden #' + orden.id + ' actualizada: ' + ESTADOS[actualizada.estado] + '.')
    } catch (fallo) {
      setErrorCambio(mensajeError(fallo, 'No se pudo cambiar el estado. Intenta nuevamente.'))
    } finally {
      setCambiando(null)
    }
  }

  function ordenCerrada(orden: OrdenDetalleRespuesta) {
    setDialogo({ tipo: 'detalle', id: orden.id, ordenInicial: orden })
    setAviso('Orden #' + orden.id + ' cerrada. Intervención registrada.')
    recargarOrdenes()
  }

  function abrirCierreExistente(id: number) {
    setDialogo({ tipo: 'detalle', id, aviso: 'La orden ya estaba cerrada. Puedes consultar su cierre registrado.' })
    recargarOrdenes()
  }

  function recargarOrdenes() {
    setVista({ tipo: 'cargando' })
    setPage(1)
    setRevision((anterior) => anterior + 1)
  }

  function cerrarDetalle() {
    setDialogo(null)
    if (dialogo?.tipo === 'detalle' && (dialogo.ordenInicial || dialogo.aviso)) {
      window.requestAnimationFrame(() => encabezado.current?.focus())
    }
  }

  function cargarPagina(nueva: number) {
    setVista({ tipo: 'cargando', datos })
    setPage(nueva)
  }

  function alternarFiltro() {
    setVista({ tipo: 'cargando' })
    setPage(1)
    setMostrarTodas((anterior) => !anterior)
  }

  let titulo = 'Mis órdenes de trabajo'
  if (puedeEscribir) titulo = 'Órdenes de trabajo'
  if (soloAbiertas) titulo = 'Órdenes de trabajo pendientes'

  let mensajeVacio = 'Aún no tienes órdenes asignadas.'
  if (puedeEscribir) mensajeVacio = 'Aún no hay órdenes de trabajo.'
  if (soloAbiertas) mensajeVacio = 'No tienes órdenes abiertas.'

  const paginas = Math.max(1, Math.ceil((datos?.total ?? 0) / TAMANO))
  return (
    <>
      <div className="encabezado-pagina">
        <div>
          <h1 ref={encabezado} tabIndex={-1}>{titulo}</h1>
          {soloAbiertas && <p className="ayuda">Pendientes de iniciar y en progreso.</p>}
        </div>
        {esTecnico && (
          <button className="boton boton-secundario" type="button" onClick={alternarFiltro}
            disabled={cambiando !== null}>
            <Icono nombre="filtros" />
            {soloAbiertas ? 'Ver todas mis órdenes' : 'Ver órdenes pendientes'}
          </button>
        )}
        {puedeEscribir && (
          <button className="boton boton-primario" type="button" onClick={() => { setAviso(''); setCreando(true) }}>
            <Icono nombre="ordenNueva" />
            Crear orden
          </button>
        )}
      </div>

      {aviso && <p className="aviso aviso-exito" role="status">{aviso}</p>}
      {errorCambio && <p className="aviso aviso-error" role="alert">{errorCambio}</p>}
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
              <p className="ayuda">{mensajeVacio}</p>
            )}
            <ul className="ordenes-resultados">
              {datos.items.map((orden) => (
                <li className="orden" key={orden.id}>
                  <div className="orden-cabecera">
                    <div>
                      <p className="ayuda">Orden #{orden.id} · {orden.falla_id === null
                        ? 'Preventiva' + (orden.plan_preventivo_id ? ' · Plan #' + orden.plan_preventivo_id : '')
                        : 'Falla #' + orden.falla_id}</p>
                      <h2>{orden.equipo_codigo} · {orden.equipo_nombre}</h2>
                    </div>
                    <span className={'insignia orden-' + orden.estado.toLowerCase()}><Icono nombre={ICONOS_ESTADO[orden.estado]} />{ESTADOS[orden.estado]}</span>
                  </div>
                  <p className="descripcion-falla">{orden.descripcion}</p>
                  <dl className="orden-datos">
                    {puedeEscribir && <div><dt>Técnico</dt><dd>{orden.tecnico_nombre}</dd></div>}
                    <div><dt>{orden.falla_id === null ? 'Prioridad del equipo' : 'Prioridad de la falla'}</dt><dd>{orden.prioridad}</dd></div>
                    <div><dt>Fecha límite</dt><dd><time dateTime={orden.fecha_limite}>
                      {FORMATO_FECHA.format(new Date(orden.fecha_limite + 'T00:00:00Z'))}
                    </time></dd></div>
                  </dl>
                  <div className="acciones-reporte">
                    {orden.estado === 'PENDIENTE' && (
                      <button className="boton boton-primario" type="button" aria-label={'Iniciar orden #' + orden.id}
                        disabled={vista.tipo === 'cargando' || cambiando !== null}
                        onClick={() => iniciarOrden(orden)}>
                        <Icono nombre="iniciar" />
                        {cambiando === orden.id ? 'Actualizando…' : 'Iniciar trabajo'}
                      </button>
                    )}
                    {orden.estado === 'EN_PROGRESO' && esTecnico && usuario.id === orden.tecnico_id && (
                      <button className="boton boton-secundario" type="button" aria-label={'Cerrar orden #' + orden.id}
                        disabled={vista.tipo === 'cargando' || cambiando !== null}
                        onClick={() => {
                          setAviso('')
                          setErrorCambio('')
                          setDialogo({ tipo: 'cierre', orden })
                        }}><Icono nombre="completar" />Cerrar orden</button>
                    )}
                    <button className="boton boton-secundario" type="button"
                      aria-label={(orden.estado === 'CERRADA' ? 'Ver intervención de la orden #' : 'Ver detalle de la orden #') + orden.id}
                      disabled={vista.tipo === 'cargando' || cambiando !== null}
                      onClick={() => setDialogo({ tipo: 'detalle', id: orden.id })}>
                      <Icono nombre="ver" />{orden.estado === 'CERRADA' ? 'Ver intervención' : 'Ver detalle'}
                    </button>
                  </div>
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
      {dialogo?.tipo === 'cierre' && (
        <CerrarOrden orden={dialogo.orden} alCerrar={() => setDialogo(null)} alGuardar={ordenCerrada}
          alEncontrarCerrada={() => abrirCierreExistente(dialogo.orden.id)} />
      )}
      {dialogo?.tipo === 'detalle' && (
        <DetalleIntervencion key={dialogo.id} id={dialogo.id} ordenInicial={dialogo.ordenInicial}
          aviso={dialogo.aviso} alCerrar={cerrarDetalle} />
      )}
    </>
  )
}
