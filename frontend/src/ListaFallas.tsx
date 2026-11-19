import { Icono } from './Icono'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { PaginaFallas } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { mostrarFecha } from './activos'
import { mensajeError } from './api'

const TAMANO = 20

type Vista =
  | { tipo: 'cargando'; datos?: PaginaFallas }
  | { tipo: 'error'; mensaje: string; datos?: PaginaFallas }
  | { tipo: 'lista'; datos: PaginaFallas }

export function ListaFallas({ resumen = false }: { resumen?: boolean } = {}) {
  const { puedeEscribir, solicitar } = useAuth()
  const puedeAsignar = puedeEscribir && !resumen
  const tamano = resumen ? 5 : TAMANO
  const [page, setPage] = useState(1)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [reintentos, setReintentos] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const { datos } = vista

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    const filtro = soloPendientes ? '&sin_orden=true' : ''
    solicitar<PaginaFallas>(`/fallas?page=${page}&size=${tamano}${filtro}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos, mensaje: mensajeError(fallo, 'No se pudieron consultar las fallas.'),
        }))
      })

    return () => controlador.abort()
  }, [page, reintentos, solicitar, soloPendientes, tamano])

  function cambiarPagina(nueva: number) {
    setVista({ tipo: 'cargando', datos })
    setPage(nueva)
  }

  const paginas = Math.max(1, Math.ceil((datos?.total ?? 0) / tamano))

  let titulo = 'Mis reportes'
  if (puedeAsignar) titulo = 'Reportes de fallas'
  if (resumen) titulo = 'Últimas fallas reportadas'

  return (
    <section className="panel reportes" aria-labelledby="titulo-lista-fallas">
      <div className="cabecera-listado-fallas">
        <h2 id="titulo-lista-fallas">{titulo}</h2>
        {puedeAsignar && (
          <button className="boton boton-secundario" type="button" aria-pressed={soloPendientes}
            disabled={vista.tipo === 'cargando'} onClick={() => {
              setVista({ tipo: 'cargando' })
              setPage(1)
              setSoloPendientes((anterior) => !anterior)
            }}><Icono nombre="filtros" />Fallas sin orden</button>
        )}
      </div>
      {vista.tipo === 'cargando' && <p className="ayuda" role="status">Cargando reportes…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setVista({ tipo: 'cargando', datos })
            setReintentos((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar reportes</button>
        </div>
      )}
      {datos && (
        <>
          <p className="ayuda" role="status">{datos.total === 1 ? '1 reporte' : datos.total + ' reportes'}</p>
          {datos.items.length === 0 && (
            <p className="ayuda">{soloPendientes ? 'No hay fallas pendientes de asignar.' : 'Aún no hay reportes.'}</p>
          )}
          <ul className="lista-reportes">
            {datos.items.map((falla) => (
              <li key={falla.id} className="reporte">
                <div className="reporte-cabecera">
                  <h3>{falla.equipo_codigo} · {falla.equipo_nombre}</h3>
                  <span className={'insignia criticidad-' + falla.prioridad.toLowerCase()}>Prioridad {falla.prioridad}</span>
                </div>
                <p className="descripcion-falla">{falla.descripcion}</p>
                <p className="ayuda">
                  {mostrarFecha(falla.fecha_reporte)} · Reportada{puedeAsignar ? ' por ' + falla.usuario_nombre : ''}
                </p>
                {puedeAsignar && soloPendientes && vista.tipo === 'lista' && (
                  <Link className="boton boton-secundario crear-desde-falla" to="/ordenes" state={{ falla }}>
                    <Icono nombre="ordenNueva" />
                    Crear orden
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {resumen && paginas > 1 && (
            <Link className="boton boton-secundario" to="/fallas">
              <Icono nombre="falla" /> Ver todos mis reportes
            </Link>
          )}
          {!resumen && paginas > 1 && (
            <nav className="paginacion" aria-label="Paginación de fallas">
              <p>Página {datos.page} de {paginas}</p>
              <div>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || page <= 1}
                  onClick={() => cambiarPagina(page - 1)}><Icono nombre="anterior" />Anterior</button>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || page >= paginas}
                  onClick={() => cambiarPagina(page + 1)}><Icono nombre="siguiente" />Siguiente</button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
