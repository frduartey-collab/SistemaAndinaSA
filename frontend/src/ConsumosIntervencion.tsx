import { useRef, useState } from 'react'
import type { RepuestoRespuesta } from '../../backend/src/dominio'
import { Icono } from './Icono'
import { SelectorOrden } from './SelectorOrden'

const LIMITE_CONSUMOS = 100
const TAMANO_CATALOGO = 5

export type BorradorConsumo = {
  repuesto: RepuestoRespuesta
  cantidad: string
}

type Props = {
  grupo: string
  consumos: BorradorConsumo[]
  cantidadesInvalidas: number[]
  alCambiar: (consumos: BorradorConsumo[]) => void
}

export function ConsumosIntervencion({ grupo, consumos, cantidadesInvalidas, alCambiar }: Props) {
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState<RepuestoRespuesta | null>(null)
  const botonAbrir = useRef<HTMLButtonElement>(null)
  const seleccionados = new Set(consumos.map(({ repuesto }) => repuesto.id))
  const limiteAlcanzado = consumos.length >= LIMITE_CONSUMOS
  const grupoCatalogo = grupo + '-catalogo'
  const puedeAgregar = seleccion !== null && !seleccionados.has(seleccion.id) && !limiteAlcanzado

  function abrirSelector() {
    setSelectorAbierto(true)
    requestAnimationFrame(() => document.getElementById(grupoCatalogo + '-busqueda')?.focus())
  }

  function cerrarSelector() {
    setSelectorAbierto(false)
    setSeleccion(null)
    requestAnimationFrame(() => botonAbrir.current?.focus())
  }

  function agregarAlConsumo() {
    if (!puedeAgregar || !seleccion) return
    const idCantidad = grupo + '-cantidad-' + seleccion.id
    alCambiar([...consumos, { repuesto: seleccion, cantidad: '1' }])
    setSeleccion(null)
    setSelectorAbierto(false)
    requestAnimationFrame(() => document.getElementById(idCantidad)?.focus())
  }

  function quitar(id: number) {
    alCambiar(consumos.filter(({ repuesto }) => repuesto.id !== id))
    requestAnimationFrame(() => {
      if (selectorAbierto) document.getElementById(grupoCatalogo + '-busqueda')?.focus()
      else botonAbrir.current?.focus()
    })
  }

  return (
    <fieldset className="consumos-intervencion">
      <legend>Repuestos consumidos (opcional)</legend>
      {consumos.length === 0 && <p className="ayuda">Aún no has añadido repuestos.</p>}
      {consumos.length > 0 && (
        <ul className="lista-consumos">
          {consumos.map(({ repuesto, cantidad }) => {
            const id = grupo + '-cantidad-' + repuesto.id
            const invalida = cantidadesInvalidas.includes(repuesto.id)
            return (
              <li className="consumo" key={repuesto.id}>
                <p><strong>{repuesto.codigo}</strong> · {repuesto.nombre}</p>
                <div className="campo consumo-cantidad">
                  <label htmlFor={id}>Cantidad <span className="solo-lectores">para {repuesto.codigo}</span></label>
                  <input id={id} value={cantidad} type="number" min={1} step={1} inputMode="numeric"
                    onChange={(evento) => alCambiar(consumos.map((item) => (
                      item.repuesto.id === repuesto.id ? { ...item, cantidad: evento.target.value } : item
                    )))}
                    required aria-invalid={invalida} aria-describedby={invalida ? id + '-error' : undefined} />
                  {invalida && <p className="error-campo" role="alert" id={id + '-error'}>Ingresa un número entero mayor que cero.</p>}
                </div>
                <button className="boton boton-secundario" type="button" aria-label={'Quitar ' + repuesto.codigo}
                  onClick={() => quitar(repuesto.id)}><Icono nombre="cerrar" />Quitar</button>
              </li>
            )
          })}
        </ul>
      )}

      {selectorAbierto ? (
        <div className="consumo-selector">
          <SelectorOrden<RepuestoRespuesta> titulo="Catálogo de repuestos" grupo={grupoCatalogo}
            seleccionado={seleccion} alElegir={setSeleccion} buscar etiquetaBusqueda="Buscar repuesto por código o nombre"
            ruta={(page, q) => `/repuestos?${new URLSearchParams({ page: String(page), size: String(TAMANO_CATALOGO), q })}`}
            etiqueta={(repuesto) => repuesto.codigo + ' · ' + repuesto.nombre}
            detalle={(repuesto) => seleccionados.has(repuesto.id) ? 'Ya añadido al consumo' : 'Stock actual: ' + repuesto.stock_actual}
            opcionDeshabilitada={(repuesto) => seleccionados.has(repuesto.id)}
            sinResultados="No se encontraron repuestos." />
          <div className="filtros-acciones">
            <button className="boton boton-secundario" type="button" onClick={cerrarSelector}>Cancelar selección</button>
            <button className="boton boton-secundario" type="button" disabled={!puedeAgregar} onClick={agregarAlConsumo}>
              <Icono nombre="crear" />Agregar al consumo
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button className="boton boton-secundario" type="button" ref={botonAbrir} disabled={limiteAlcanzado}
            onClick={abrirSelector}><Icono nombre="crear" />Añadir repuesto</button>
          {limiteAlcanzado && <p className="ayuda">Puedes registrar hasta {LIMITE_CONSUMOS} repuestos distintos.</p>}
        </div>
      )}
    </fieldset>
  )
}
