import { useState, type FormEvent } from 'react'
import type { FallaRespuesta, OrdenCrearSolicitud, OrdenRespuesta, TecnicoResumen } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { SelectorOrden } from './SelectorOrden'
import { mensajeError } from './api'

const TAMANO = 5
const FECHA_CHILE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
})

type Props = {
  fallaInicial: FallaRespuesta | null
  alCerrar: () => void
  alGuardar: (orden: OrdenRespuesta) => void
}

export function CrearOrden({ fallaInicial, alCerrar, alGuardar }: Props) {
  const { puedeEscribir, solicitar } = useAuth()
  const [falla, setFalla] = useState(fallaInicial)
  const [tecnico, setTecnico] = useState<TecnicoResumen | null>(null)
  const [fecha, setFecha] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const hoy = FECHA_CHILE.format()

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando || !puedeEscribir) return
    if (!falla || !tecnico || !fecha) {
      setError('Selecciona una falla y un técnico e indica la fecha límite.')
      return
    }
    if (fecha < hoy) {
      setError('La fecha límite debe ser hoy o una fecha posterior.')
      return
    }

    setError('')
    setGuardando(true)
    const datos: OrdenCrearSolicitud = { falla_id: falla.id, tecnico_id: tecnico.id, fecha_limite: fecha }
    try {
      const orden = await solicitar<OrdenRespuesta>('/ordenes', { method: 'POST', body: JSON.stringify(datos) })
      alGuardar(orden)
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo crear la orden. Tus datos se conservaron.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo="Crear orden de trabajo" amplio ocupado={guardando} alCerrar={alCerrar}>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form noValidate aria-busy={guardando} onSubmit={guardar}>
        <fieldset className="campos-orden" disabled={guardando}>
          <legend className="solo-lectores">Datos de la orden</legend>
          <SelectorOrden<FallaRespuesta>
            titulo="Falla pendiente" grupo="orden-falla" seleccionado={falla} alElegir={setFalla}
            ruta={(page) => `/fallas?sin_orden=true&page=${page}&size=${TAMANO}`}
            etiqueta={(dato) => '#' + dato.id + ' · ' + dato.equipo_codigo + ' · ' + dato.equipo_nombre}
            detalle={(dato) => dato.descripcion}
            sinResultados="No hay fallas pendientes de asignar."
          />
          <SelectorOrden<TecnicoResumen>
            titulo="Técnico asignado" grupo="orden-tecnico" seleccionado={tecnico} alElegir={setTecnico}
            ruta={(page, q) => `/ordenes/tecnicos?${new URLSearchParams({ page: String(page), size: String(TAMANO), q })}`}
            etiqueta={(dato) => dato.nombre + ' · #' + dato.id}
            buscar
            sinResultados="No se encontraron técnicos activos."
          />
          <div className="campo">
            <label htmlFor="orden-fecha">Fecha límite</label>
            <input id="orden-fecha" type="date" min={hoy} required value={fecha}
              onChange={(evento) => setFecha(evento.target.value)} />
          </div>
        </fieldset>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="boton boton-primario" disabled={guardando}>
            {guardando ? 'Creando…' : 'Guardar orden'}
          </button>
        </div>
        <p role="status" className="solo-lectores">{guardando ? 'Creando orden de trabajo…' : ''}</p>
      </form>
    </Dialogo>
  )
}
