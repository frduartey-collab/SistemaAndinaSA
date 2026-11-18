import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ActivoRespuesta, CriticidadEquipo, EstadoEquipo, PaginaActivos } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { BajaEquipo } from './BajaEquipo'
import { DetalleEquipo } from './DetalleEquipo'
import { FormularioEquipo, type BorradorEquipo } from './FormularioEquipo'
import { criticidades, estados, etiquetasEstado, mostrarHoras } from './activos'
import { mensajeError } from './api'

const TAMANO = 20

type Filtros = {
  q: string
  criticidad: CriticidadEquipo | ''
  estado: EstadoEquipo | ''
}

type Consulta = Filtros & { page: number }

const FILTROS_INICIALES: Filtros = { q: '', criticidad: '', estado: '' }

type VistaEquipos =
  | { tipo: 'cargando'; pagina?: PaginaActivos }
  | { tipo: 'error'; mensaje: string; pagina?: PaginaActivos }
  | { tipo: 'listo'; pagina: PaginaActivos }

type AccionEquipo =
  | { tipo: 'crear' }
  | { tipo: 'detalle' | 'editar' | 'baja'; equipo: ActivoRespuesta }

type PropsCatalogo = {
  borrador?: BorradorEquipo
  alConservarBorrador?: (borrador: BorradorEquipo | null) => void
}

export function CatalogoEquipos({ borrador, alConservarBorrador }: PropsCatalogo = {}) {
  const { puedeEscribir, solicitar } = useAuth()
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const [consulta, setConsulta] = useState<Consulta>({ ...FILTROS_INICIALES, page: 1 })
  const [vista, setVista] = useState<VistaEquipos>({ tipo: 'cargando' })
  const [revision, setRevision] = useState(0)
  const [accion, setAccion] = useState<AccionEquipo | null>(() => {
    if (!puedeEscribir || !borrador) return null
    return borrador.equipo ? { tipo: 'editar', equipo: borrador.equipo } : { tipo: 'crear' }
  })
  const [aviso, setAviso] = useState('')
  const titulo = useRef<HTMLHeadingElement>(null)
  const cargando = vista.tipo === 'cargando'
  const pagina = vista.pagina
  const hayFiltros = Boolean(consulta.q || consulta.criticidad || consulta.estado)
  const ultimaPagina = Math.max(1, Math.ceil((pagina?.total ?? 0) / TAMANO))

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    const parametros = new URLSearchParams({ page: String(consulta.page), size: String(TAMANO) })
    if (consulta.q) parametros.set('q', consulta.q)
    if (consulta.criticidad) parametros.set('criticidad', consulta.criticidad)
    if (consulta.estado) parametros.set('estado', consulta.estado)

    solicitar<PaginaActivos>(`/activos?${parametros.toString()}`, { signal })
      .then((respuesta) => {
        if (signal.aborted) return
        const limite = Math.max(1, Math.ceil(respuesta.total / TAMANO))
        if (consulta.page > limite) {
          setConsulta({ ...consulta, page: limite })
          return
        }
        setVista({ tipo: 'listo', pagina: respuesta })
      })
      .catch((error: unknown) => {
        if (signal.aborted) return
        setVista((anterior) => ({
          tipo: 'error',
          pagina: anterior.pagina,
          mensaje: mensajeError(error, 'No se pudieron cargar los equipos.'),
        }))
      })

    return () => controlador.abort()
  }, [consulta, revision, solicitar])

  function mostrarCarga() {
    setVista((anterior) => ({ tipo: 'cargando', pagina: anterior.pagina }))
  }

  function cargar(siguiente: Consulta) {
    mostrarCarga()
    setConsulta(siguiente)
  }

  function aplicarFiltros(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (cargando) return
    setAviso('')
    cargar({ ...filtros, q: filtros.q.trim(), page: 1 })
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_INICIALES)
    setAviso('')
    cargar({ ...FILTROS_INICIALES, page: 1 })
  }

  function refrescar() {
    mostrarCarga()
    setRevision((anterior) => anterior + 1)
  }

  function terminar(mensaje: string) {
    cerrar()
    setAviso(mensaje)
    refrescar()
    requestAnimationFrame(() => titulo.current?.focus())
  }

  function cerrar() {
    if (accion?.tipo === 'editar' || accion?.tipo === 'crear') alConservarBorrador?.(null)
    setAccion(null)
  }

  function conservar(datos: BorradorEquipo) {
    alConservarBorrador?.(datos)
  }

  return (
    <>
      <div className="encabezado-pagina">
        <div>
          <h1 ref={titulo} tabIndex={-1}>Catálogo de equipos</h1>
        </div>
        {puedeEscribir && (
          <button type="button" className="boton boton-primario" onClick={() => setAccion({ tipo: 'crear' })}>
            <span aria-hidden="true">＋</span> Nuevo equipo
          </button>
        )}
      </div>

      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>

      <form className="panel filtros" onSubmit={aplicarFiltros} aria-label="Filtros del catálogo">
        <div className="campo">
          <label htmlFor="buscar-equipo">Código o nombre</label>
          <input id="buscar-equipo" type="search" maxLength={120} value={filtros.q}
            placeholder="Buscar equipo"
            onChange={(evento) => setFiltros({ ...filtros, q: evento.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="filtro-criticidad">Criticidad</label>
          <select id="filtro-criticidad" value={filtros.criticidad}
            onChange={(evento) => setFiltros({ ...filtros, criticidad: evento.target.value as Filtros['criticidad'] })}>
            <option value="">Todas</option>
            {criticidades.map((valor) => <option key={valor}>{valor}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={filtros.estado}
            onChange={(evento) => setFiltros({ ...filtros, estado: evento.target.value as Filtros['estado'] })}>
            <option value="">Todos</option>
            {estados.map((valor) => <option key={valor} value={valor}>{etiquetasEstado[valor]}</option>)}
          </select>
        </div>
        <div className="filtros-acciones">
          <button type="submit" className="boton boton-primario" disabled={cargando}>Buscar</button>
          <button type="button" className="boton boton-secundario" onClick={limpiarFiltros} disabled={cargando}>Limpiar</button>
        </div>
      </form>

      {cargando && <p role="status" className="aviso">Cargando equipos…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}{pagina ? ' Se muestran los últimos resultados disponibles.' : ''}</p>
          <button type="button" className="boton boton-secundario" onClick={refrescar}>Reintentar</button>
        </div>
      )}

      {pagina && (
        <section className="panel resultados" aria-label="Resultados del catálogo" aria-busy={cargando}>
          <p className="total" role="status">
            {pagina.total === 1 ? '1 equipo encontrado' : pagina.total + ' equipos encontrados'}
          </p>
          {pagina.items.length ? (
            <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Tabla de equipos">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Marca / modelo</th>
                    <th scope="col">Ubicación</th>
                    <th scope="col">Criticidad</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Horas</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.items.map((equipo) => (
                    <tr key={equipo.id}>
                      <th scope="row" className="codigo">{equipo.codigo}</th>
                      <td className="nombre-equipo">{equipo.nombre}</td>
                      <td>{[equipo.marca, equipo.modelo].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{equipo.ubicacion}</td>
                      <td><span className={'insignia criticidad-' + equipo.criticidad.toLowerCase()}>{equipo.criticidad}</span></td>
                      <td><span className={'insignia ' + (equipo.estado === 'OPERATIVO' ? 'operativo' : 'estado-equipo')}>{etiquetasEstado[equipo.estado]}</span></td>
                      <td className="horas">{mostrarHoras(equipo.uso_acumulado_horas)}</td>
                      <td>
                        <div className="acciones-fila">
                          <button type="button" className="boton-texto" disabled={cargando}
                            aria-label={'Ver detalle de ' + equipo.codigo}
                            onClick={() => setAccion({ tipo: 'detalle', equipo })}>Ver detalle</button>
                          {puedeEscribir && (
                            <>
                              <button type="button" className="boton-texto" disabled={cargando}
                                aria-label={'Editar ' + equipo.codigo}
                                onClick={() => setAccion({ tipo: 'editar', equipo })}>Editar</button>
                              <button type="button" className="boton-texto peligro" disabled={cargando}
                                aria-label={'Dar de baja ' + equipo.codigo}
                                onClick={() => setAccion({ tipo: 'baja', equipo })}>Dar de baja</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sin-resultados">
              <h2>{hayFiltros ? 'No hay coincidencias' : 'Aún no hay equipos registrados'}</h2>
              {hayFiltros && <p>Prueba otra búsqueda o limpia los filtros.</p>}
            </div>
          )}

          {pagina.total > 0 && (
            <nav className="paginacion" aria-label="Paginación del catálogo">
              <p>Página {pagina.page} de {ultimaPagina}</p>
              <div>
                <button type="button" className="boton boton-secundario" disabled={vista.tipo !== 'listo' || pagina.page <= 1}
                  onClick={() => cargar({ ...consulta, page: pagina.page - 1 })}>Anterior</button>
                <button type="button" className="boton boton-secundario" disabled={vista.tipo !== 'listo' || pagina.page >= ultimaPagina}
                  onClick={() => cargar({ ...consulta, page: pagina.page + 1 })}>Siguiente</button>
              </div>
            </nav>
          )}
        </section>
      )}

      {accion?.tipo === 'detalle' && (
        <DetalleEquipo key={accion.equipo.id} id={accion.equipo.id} codigo={accion.equipo.codigo} alCerrar={cerrar}
          alEditar={puedeEscribir ? (equipo) => setAccion({ tipo: 'editar', equipo }) : undefined} />
      )}
      {puedeEscribir && accion?.tipo === 'crear' && (
        <FormularioEquipo borrador={borrador} alConservar={conservar} alCerrar={cerrar} alGuardar={terminar} />
      )}
      {puedeEscribir && accion?.tipo === 'editar' && (
        <FormularioEquipo key={accion.equipo.id} equipo={accion.equipo} borrador={borrador}
          alConservar={conservar} alCerrar={cerrar} alGuardar={terminar} />
      )}
      {puedeEscribir && accion?.tipo === 'baja' && (
        <BajaEquipo equipo={accion.equipo} alCerrar={cerrar} alDarDeBaja={terminar} />
      )}
    </>
  )
}

