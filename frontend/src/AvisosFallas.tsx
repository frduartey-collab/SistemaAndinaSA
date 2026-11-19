import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { NotificacionFalla, PaginaNotificaciones } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { mostrarFecha } from './activos'
import { mensajeError } from './api'

const TAMANO = 20

type Vista =
  | { tipo: 'cargando'; datos?: PaginaNotificaciones }
  | { tipo: 'error'; mensaje: string; datos?: PaginaNotificaciones }
  | { tipo: 'lista'; datos: PaginaNotificaciones }

export function AvisosFallas() {
  const { solicitar } = useAuth()
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const [marcando, setMarcando] = useState<number | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorMarca, setErrorMarca] = useState('')
  const ocupado = useRef(false)
  const { datos } = vista
  const cargando = vista.tipo === 'cargando'
  const paginas = Math.max(1, Math.ceil((datos?.total ?? 0) / TAMANO))

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<PaginaNotificaciones>(`/notificaciones?page=${page}&size=${TAMANO}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos,
          mensaje: mensajeError(fallo, 'No se pudieron cargar los avisos.'),
        }))
      })
    return () => controlador.abort()
  }, [page, revision, solicitar])

  function refrescar() {
    setVista((anterior) => ({ tipo: 'cargando', datos: anterior.datos }))
    setRevision((anterior) => anterior + 1)
  }

  function cambiarPagina(nueva: number) {
    setVista({ tipo: 'cargando' })
    setPage(nueva)
  }

  async function marcarComoLeido(notificacion: NotificacionFalla) {
    if (ocupado.current || notificacion.leida) return
    ocupado.current = true
    setMarcando(notificacion.id)
    setErrorMarca('')
    setAviso('')

    try {
      await solicitar<void>(`/notificaciones/${notificacion.id}/leida`, { method: 'PATCH' })
      setVista((anterior) => {
        if (!anterior.datos) return anterior
        const items = anterior.datos.items.map((item) => item.id === notificacion.id ? { ...item, leida: true } : item)
        return { ...anterior, datos: { ...anterior.datos, items } }
      })
      setAviso('Aviso marcado como leído.')
      requestAnimationFrame(() => document.getElementById('aviso-falla-' + notificacion.id)?.focus())
    } catch (fallo) {
      setErrorMarca(mensajeError(fallo, 'No se pudo marcar el aviso. Intenta nuevamente.'))
    } finally {
      ocupado.current = false
      setMarcando(null)
    }
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Avisos de fallas</h1>
        <button className="boton boton-secundario" type="button" disabled={cargando || marcando !== null} onClick={refrescar}>
          <Icono nombre="sincronizar" />Actualizar avisos
        </button>
      </div>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      {errorMarca && <p className="aviso aviso-error" role="alert">{errorMarca}</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={refrescar}>
            <Icono nombre="sincronizar" />Reintentar
          </button>
        </div>
      )}
      <section className="panel reportes" aria-label="Bandeja de avisos" aria-busy={cargando}>
        {cargando && <p className="ayuda" role="status">Cargando avisos…</p>}
        {datos && (
          <>
            <p className="ayuda">{datos.total === 1 ? '1 aviso' : datos.total + ' avisos'}</p>
            {datos.items.length > 0 ? (
              <ul className="lista-reportes">
                {datos.items.map((notificacion) => (
                  <li key={notificacion.id} className="reporte aviso-falla">
                    <div className="reporte-cabecera">
                      <h2 id={'aviso-falla-' + notificacion.id} tabIndex={-1}>
                        Falla #{notificacion.falla_id} · {notificacion.equipo_codigo} · {notificacion.equipo_nombre}
                      </h2>
                      <span className={'insignia ' + (notificacion.leida ? 'estado-equipo' : 'orden-en_progreso')}>
                        {notificacion.leida ? 'Leído' : 'Sin leer'}
                      </span>
                    </div>
                    <p className="ayuda"><time dateTime={notificacion.fecha}>{mostrarFecha(notificacion.fecha)}</time></p>
                    <div className="acciones-reporte">
                      <Link className="boton boton-secundario" to={'/fallas/' + notificacion.falla_id} state={{ desdeAvisos: true }}>
                        <Icono nombre="ver" />Ver falla #{notificacion.falla_id}
                      </Link>
                      {!notificacion.leida && (
                        <button className="boton boton-secundario" type="button"
                          disabled={vista.tipo !== 'lista' || marcando !== null}
                          aria-label={marcando === notificacion.id ? undefined : 'Marcar aviso #' + notificacion.id + ' como leído'}
                          onClick={() => marcarComoLeido(notificacion)}>
                          <Icono nombre="completar" />{marcando === notificacion.id ? 'Marcando…' : 'Marcar como leído'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p>Aún no hay avisos de fallas.</p>}
            {paginas > 1 && (
              <nav className="paginacion" aria-label="Paginación de avisos">
                <p>Página {datos.page} de {paginas}</p>
                <div>
                  <button className="boton boton-secundario" type="button"
                    disabled={vista.tipo !== 'lista' || marcando !== null || page <= 1}
                    onClick={() => cambiarPagina(page - 1)}><Icono nombre="anterior" />Anterior</button>
                  <button className="boton boton-secundario" type="button"
                    disabled={vista.tipo !== 'lista' || marcando !== null || page >= paginas}
                    onClick={() => cambiarPagina(page + 1)}><Icono nombre="siguiente" />Siguiente</button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  )
}
