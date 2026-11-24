import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PaginaRepuestos } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { DialogoInventario, type AccionInventario } from './DialogoInventario'
import { Icono } from './Icono'
import { mensajeError } from './api'
import { PESOS } from './planes'

const TAMANO = 20

type Vista =
  | { tipo: 'cargando'; pagina?: PaginaRepuestos }
  | { tipo: 'error'; mensaje: string; pagina?: PaginaRepuestos }
  | { tipo: 'lista'; pagina: PaginaRepuestos }

export function InventarioBodega() {
  const { solicitar } = useAuth()
  const [texto, setTexto] = useState('')
  const [consulta, setConsulta] = useState({ q: '', page: 1 })
  const [revision, setRevision] = useState(0)
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const [accion, setAccion] = useState<AccionInventario | null>(null)
  const [aviso, setAviso] = useState('')
  const titulo = useRef<HTMLHeadingElement>(null)
  const pagina = vista.pagina
  const cargando = vista.tipo === 'cargando'
  const ultimaPagina = Math.max(1, Math.ceil((pagina?.total ?? 0) / TAMANO))

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    const parametros = new URLSearchParams({ page: String(consulta.page), size: String(TAMANO) })
    if (consulta.q) parametros.set('q', consulta.q)

    solicitar<PaginaRepuestos>(`/repuestos?${parametros}`, { signal })
      .then((respuesta) => {
        if (signal.aborted) return
        const ultima = Math.max(1, Math.ceil(respuesta.total / respuesta.size))
        if (consulta.page > ultima) {
          setConsulta({ ...consulta, page: ultima })
        } else {
          setVista({ tipo: 'lista', pagina: respuesta })
        }
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista((anterior) => ({
          tipo: 'error', pagina: anterior.pagina,
          mensaje: mensajeError(fallo, 'No se pudo cargar el inventario.'),
        }))
      })

    return () => controlador.abort()
  }, [consulta, revision, solicitar])

  function cargar(siguiente: typeof consulta) {
    setVista({ tipo: 'cargando' })
    setConsulta(siguiente)
  }

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!cargando) cargar({ q: texto.trim(), page: 1 })
  }

  function refrescar() {
    setVista((anterior) => ({ tipo: 'cargando', pagina: anterior.pagina }))
    setRevision((anterior) => anterior + 1)
  }

  function cerrarYRefrescar() {
    setAccion(null)
    refrescar()
    requestAnimationFrame(() => titulo.current?.focus())
  }

  function guardar(mensaje: string) {
    setAviso(mensaje)
    cerrarYRefrescar()
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1 ref={titulo} tabIndex={-1}>Inventario de repuestos</h1>
        <button className="boton boton-primario" type="button" onClick={() => setAccion({ tipo: 'crear' })}>
          <Icono nombre="crear" />Nuevo repuesto
        </button>
      </div>

      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>

      <form className="panel filtros filtros-inventario" onSubmit={buscar} aria-label="Búsqueda de repuestos">
        <div className="campo">
          <label htmlFor="buscar-repuesto">Código o nombre</label>
          <input id="buscar-repuesto" type="search" value={texto} maxLength={120}
            onChange={(evento) => setTexto(evento.target.value)} />
        </div>
        <div className="filtros-acciones">
          <button type="submit" className="boton boton-primario" disabled={cargando}><Icono nombre="buscar" />Buscar</button>
          <button type="button" className="boton boton-secundario" disabled={cargando} onClick={() => {
            setTexto('')
            cargar({ q: '', page: 1 })
          }}><Icono nombre="limpiar" />Limpiar</button>
        </div>
      </form>

      {cargando && <p className="aviso" role="status">Cargando repuestos…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={refrescar}><Icono nombre="sincronizar" />Reintentar</button>
        </div>
      )}

      {pagina && (
        <section className="panel resultados" aria-label="Resultados de Inventario" aria-busy={cargando}>
          <p className="total" role="status">{pagina.total === 1 ? '1 repuesto' : pagina.total + ' repuestos'}</p>
          {pagina.items.length > 0 ? (
            <div className="tabla-contenedor" role="region" aria-label="Tabla de repuestos" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Repuesto</th>
                    <th scope="col">Stock actual</th>
                    <th scope="col">Stock mínimo</th>
                    <th scope="col">Costo unitario (CLP)</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.items.map((repuesto) => (
                    <tr key={repuesto.id}>
                      <th scope="row" className="codigo codigo-repuesto">{repuesto.codigo}</th>
                      <td className="nombre-equipo">
                        {repuesto.nombre}
                        {repuesto.descripcion && <p className="ayuda descripcion-repuesto">{repuesto.descripcion}</p>}
                      </td>
                      <td className="stock-repuesto">
                        {repuesto.stock_actual}
                        {repuesto.stock_actual < repuesto.stock_minimo &&
                          <span className="insignia criticidad-alta"><Icono nombre="falla" />Stock bajo</span>}
                      </td>
                      <td className="horas">{repuesto.stock_minimo}</td>
                      <td className="horas">{repuesto.costo_unitario_clp == null ? 'Sin costo registrado' : PESOS.format(repuesto.costo_unitario_clp)}</td>
                      <td>
                        <div className="acciones-repuesto">
                          <button className="boton-texto" type="button" aria-label={'Editar ' + repuesto.codigo}
                            disabled={vista.tipo !== 'lista'} onClick={() => setAccion({ tipo: 'editar', repuesto })}>
                            <Icono nombre="editar" />Editar
                          </button>
                          <button className="boton-texto" type="button" aria-label={'Registrar movimiento de ' + repuesto.codigo}
                            disabled={vista.tipo !== 'lista'} onClick={() => setAccion({ tipo: 'movimiento', repuesto })}>
                            <Icono nombre="cambiar" />Movimiento
                          </button>
                          <button className="boton-texto peligro" type="button" aria-label={'Dar de baja ' + repuesto.codigo}
                            disabled={vista.tipo !== 'lista' || repuesto.stock_actual !== 0}
                            onClick={() => setAccion({ tipo: 'baja', repuesto })}>
                            <Icono nombre="baja" />Dar de baja
                          </button>
                        </div>
                        {repuesto.stock_actual > 0 && <p className="ayuda">Para la baja, el stock debe estar en cero.</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sin-resultados">
              <h2>{consulta.q ? 'No hay coincidencias' : 'Aún no hay repuestos registrados'}</h2>
              {consulta.q && <p>Busca por otro código o nombre.</p>}
            </div>
          )}
          {ultimaPagina > 1 && (
            <nav className="paginacion" aria-label="Paginación de repuestos">
              <p>Página {pagina.page} de {ultimaPagina}</p>
              <div>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || pagina.page <= 1}
                  onClick={() => cargar({ ...consulta, page: pagina.page - 1 })}><Icono nombre="anterior" />Anterior</button>
                <button className="boton boton-secundario" type="button" disabled={vista.tipo !== 'lista' || pagina.page >= ultimaPagina}
                  onClick={() => cargar({ ...consulta, page: pagina.page + 1 })}><Icono nombre="siguiente" />Siguiente</button>
              </div>
            </nav>
          )}
        </section>
      )}

      {accion && <DialogoInventario accion={accion} alCerrar={() => setAccion(null)} alGuardar={guardar}
        alRevisarMovimientos={cerrarYRefrescar} />}
    </>
  )
}
