import { Icono } from './Icono'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, type RutaApi } from './AuthContext'
import { mensajeError } from './api'

type Pagina<T> = { items: T[]; total: number; page: number; size: number }
type Carga<T> =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; pagina: Pagina<T> }

type Props<T> = {
  titulo: string
  grupo: string
  seleccionado: T | null
  alElegir: (opcion: T) => void
  ruta: (pagina: number, busqueda: string) => RutaApi
  etiqueta: (opcion: T) => string
  detalle?: (opcion: T) => string
  buscar?: boolean
  etiquetaBusqueda?: string
  opcionDeshabilitada?: (opcion: T) => boolean
  sinResultados: string
}

export function SelectorOrden<T extends { id: number }>({
  titulo, grupo, seleccionado, alElegir, ruta, etiqueta, detalle, buscar,
  etiquetaBusqueda = 'Buscar técnico por nombre', opcionDeshabilitada, sinResultados,
}: Props<T>) {
  const { solicitar } = useAuth()
  const [pagina, setPagina] = useState(1)
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [intento, setIntento] = useState(0)
  const [carga, setCarga] = useState<Carga<T>>({ tipo: 'cargando' })
  const url = ruta(pagina, busqueda)
  const cargando = carga.tipo === 'cargando'

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<Pagina<T>>(url, { signal })
      .then((respuesta) => {
        if (!signal.aborted) setCarga({ tipo: 'lista', pagina: respuesta })
      })
      .catch((error: unknown) => {
        if (!signal.aborted) setCarga({ tipo: 'error', mensaje: mensajeError(error, 'No se pudieron cargar las opciones.') })
      })
    return () => controlador.abort()
  }, [url, intento, solicitar])

  function filtrar(evento?: FormEvent) {
    evento?.preventDefault()
    if (cargando) return
    setCarga({ tipo: 'cargando' })
    setBusqueda(texto.trim())
    setPagina(1)
    setIntento((anterior) => anterior + 1)
  }

  function cambiarPagina(nueva: number) {
    setCarga({ tipo: 'cargando' })
    setPagina(nueva)
  }

  const paginas = carga.tipo === 'lista' ? Math.max(1, Math.ceil(carga.pagina.total / carga.pagina.size)) : 1

  return (
    <fieldset className="selector-orden">
      <legend>{titulo}</legend>
      {seleccionado && <p className="ayuda" role="status">Selección actual: {etiqueta(seleccionado)}</p>}
      {buscar && (
        <div className="busqueda-tecnico">
          <div className="campo">
            <label htmlFor={grupo + '-busqueda'}>{etiquetaBusqueda}</label>
            <input id={grupo + '-busqueda'} value={texto} type="search" maxLength={120}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => { if (evento.key === 'Enter') filtrar(evento) }} />
          </div>
          <button className="boton boton-secundario" type="button" disabled={cargando} onClick={() => filtrar()}><Icono nombre="buscar" />Buscar</button>
        </div>
      )}
      {cargando && <p className="ayuda" role="status">Cargando opciones…</p>}
      {carga.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{carga.mensaje}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setCarga({ tipo: 'cargando' })
            setIntento((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar</button>
        </div>
      )}
      {carga.tipo === 'lista' && (
        <>
          {carga.pagina.items.length === 0 ? <p className="ayuda">{sinResultados}</p> : (
            <ul className="opciones-orden">
              {carga.pagina.items.map((opcion) => (
                <li key={opcion.id}>
                  <label className="opcion-orden">
                    <input type="radio" name={grupo} value={opcion.id}
                      disabled={opcionDeshabilitada?.(opcion)}
                      checked={seleccionado?.id === opcion.id} onChange={() => alElegir(opcion)} />
                    <span>
                      <strong>{etiqueta(opcion)}</strong>
                      {detalle && <span className="ayuda opcion-orden-detalle">{detalle(opcion)}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {paginas > 1 && (
            <nav className="paginacion" aria-label={'Paginación de ' + titulo.toLowerCase()}>
              <p>Página {pagina} de {paginas}</p>
              <div>
                <button className="boton boton-secundario" type="button" disabled={pagina <= 1}
                  onClick={() => cambiarPagina(pagina - 1)}><Icono nombre="anterior" />Anterior</button>
                <button className="boton boton-secundario" type="button" disabled={pagina >= paginas}
                  onClick={() => cambiarPagina(pagina + 1)}><Icono nombre="siguiente" />Siguiente</button>
              </div>
            </nav>
          )}
        </>
      )}
    </fieldset>
  )
}
