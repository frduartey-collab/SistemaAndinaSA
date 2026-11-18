import { useEffect, useState } from 'react'
import type { PaginaFallas } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { mostrarFecha } from './activos'
import { mensajeError } from './api'

const TAMANO = 20

type Vista =
  | { tipo: 'cargando'; datos?: PaginaFallas }
  | { tipo: 'error'; mensaje: string; datos?: PaginaFallas }
  | { tipo: 'lista'; datos: PaginaFallas }

export function ListaFallas() {
  const { puedeEscribir, solicitar } = useAuth()
  const [page, setPage] = useState(1)
  const [reintentos, setReintentos] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const { datos } = vista

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<PaginaFallas>(`/fallas?page=${page}&size=${TAMANO}`, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: respuesta })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', datos: anterior.datos, mensaje: mensajeError(fallo, 'No se pudieron consultar las fallas.'),
        }))
      })

    return () => controlador.abort()
  }, [page, reintentos, solicitar])

  function cambiarPagina(nueva: number) {
    setVista({ tipo: 'cargando', datos })
    setPage(nueva)
  }

  const paginas = Math.max(1, Math.ceil((datos?.total ?? 0) / TAMANO))

  return (
    <section className="panel reportes" aria-labelledby="titulo-lista-fallas">
      <h2 id="titulo-lista-fallas">{puedeEscribir ? 'Reportes de fallas' : 'Mis reportes'}</h2>
      {vista.tipo === 'cargando' && <p className="ayuda" role="status">Cargando reportes…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setVista({ tipo: 'cargando', datos })
            setReintentos((anterior) => anterior + 1)
          }}>Reintentar reportes</button>
        </div>
      )}
      {datos && (
        <>
          <p className="ayuda" role="status">{datos.total === 1 ? '1 reporte' : datos.total + ' reportes'}</p>
          {datos.items.length === 0 && <p className="ayuda">Aún no hay reportes.</p>}
          <ul className="lista-reportes">
            {datos.items.map((falla) => (
              <li key={falla.id} className="reporte">
                <div className="reporte-cabecera">
                  <h3>{falla.equipo_codigo} · {falla.equipo_nombre}</h3>
                  <span className={'insignia criticidad-' + falla.prioridad.toLowerCase()}>Prioridad {falla.prioridad}</span>
                </div>
                <p className="descripcion-falla">{falla.descripcion}</p>
                <p className="ayuda">
                  {mostrarFecha(falla.fecha_reporte)} · Reportada{puedeEscribir ? ' por ' + falla.usuario_nombre : ''}
                </p>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav className="paginacion" aria-label="Paginación de fallas">
              <p>Página {datos.page} de {paginas}</p>
              <div>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || page <= 1}
                  onClick={() => cambiarPagina(page - 1)}>Anterior</button>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || page >= paginas}
                  onClick={() => cambiarPagina(page + 1)}>Siguiente</button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
