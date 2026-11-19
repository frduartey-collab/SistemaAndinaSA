import { useId, useRef, useState, type FormEvent } from 'react'
import type { OrdenCierreSolicitud, OrdenDetalleRespuesta, OrdenRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { ConsumosIntervencion, type BorradorConsumo } from './ConsumosIntervencion'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { ErrorApi, mensajeError } from './api'

const LIMITE_TEXTO = 2000

type Props = {
  orden: OrdenRespuesta
  alCerrar: () => void
  alGuardar: (orden: OrdenDetalleRespuesta) => void
  alEncontrarCerrada: () => void
}

export function CerrarOrden({ orden, alCerrar, alGuardar, alEncontrarCerrada }: Props) {
  const { estado, solicitar } = useAuth()
  const campos = useId()
  const [diagnostico, setDiagnostico] = useState('')
  const [solucion, setSolucion] = useState('')
  const [duracion, setDuracion] = useState('')
  const [consumos, setConsumos] = useState<BorradorConsumo[]>([])
  const [mostrarErroresConsumo, setMostrarErroresConsumo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const enviando = useRef(false)
  const [error, setError] = useState('')
  const [errores, setErrores] = useState<Partial<Record<keyof OrdenCierreSolicitud, string>>>({})

  const puedeCerrar = estado.tipo === 'activa' && estado.usuario.rol === 'TECNICO' &&
    estado.usuario.id === orden.tecnico_id && orden.estado === 'EN_PROGRESO'
  const grupoConsumos = campos + '-consumo'
  const cantidadesInvalidas = consumos
    .filter(({ cantidad }) => !Number.isSafeInteger(Number(cantidad)) || Number(cantidad) < 1)
    .map(({ repuesto }) => repuesto.id)

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando.current || !puedeCerrar) return

    const textoDiagnostico = diagnostico.trim()
    const textoSolucion = solucion.trim()
    const minutos = Number(duracion)
    const invalidos: typeof errores = {}

    if (!textoDiagnostico) invalidos.diagnostico = 'Escribe el diagnóstico de la falla.'
    if (!textoSolucion) invalidos.solucion = 'Describe la solución que aplicaste.'
    if (!Number.isSafeInteger(minutos) || minutos <= 0) {
      invalidos.duracion_minutos = 'Ingresa un número entero de minutos mayor que cero.'
    }

    setError('')
    setErrores(invalidos)
    setMostrarErroresConsumo(true)
    const primerCampo = Object.keys(invalidos)[0]
    if (primerCampo) {
      document.getElementById(campos + '-' + primerCampo)?.focus()
      return
    }
    if (cantidadesInvalidas.length > 0) {
      document.getElementById(grupoConsumos + '-cantidad-' + cantidadesInvalidas[0])?.focus()
      return
    }

    enviando.current = true
    setGuardando(true)
    const datos: OrdenCierreSolicitud = {
      diagnostico: textoDiagnostico,
      solucion: textoSolucion,
      duracion_minutos: minutos,
      repuestos_consumidos: consumos.map(({ repuesto, cantidad }) => ({
        repuesto_id: repuesto.id,
        cantidad: Number(cantidad),
      })),
    }

    try {
      const cerrada = await solicitar<OrdenDetalleRespuesta>(`/ordenes/${orden.id}/cierre`, {
        method: 'PUT', body: JSON.stringify(datos),
      })
      alGuardar(cerrada)
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.codigo === 'ORDEN_YA_CERRADA') {
        alEncontrarCerrada()
      } else {
        setError(mensajeError(fallo, 'No se pudo cerrar la orden. Intenta nuevamente.'))
      }
    } finally {
      enviando.current = false
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={'Cerrar orden #' + orden.id} amplio ocupado={guardando} alCerrar={alCerrar}>
      <p className="nombre-detalle">{orden.equipo_codigo} · {orden.equipo_nombre}</p>
      <p className="ayuda">Al guardar, la intervención quedará disponible para consulta y la orden se cerrará.</p>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form className="formulario-intervencion" noValidate aria-busy={guardando} onSubmit={guardar}>
        <fieldset className="campos-orden" disabled={guardando || !puedeCerrar}>
          <legend className="solo-lectores">Datos de la intervención</legend>
          <div className="campo">
            <label htmlFor={campos + '-diagnostico'}>Diagnóstico</label>
            <textarea id={campos + '-diagnostico'} required rows={3} maxLength={LIMITE_TEXTO}
              value={diagnostico} onChange={(evento) => setDiagnostico(evento.target.value)}
              aria-invalid={Boolean(errores.diagnostico)}
              aria-describedby={errores.diagnostico ? campos + '-error-diagnostico' : undefined} />
            {errores.diagnostico && <p id={campos + '-error-diagnostico'} className="error-campo" role="alert">{errores.diagnostico}</p>}
          </div>
          <div className="campo">
            <label htmlFor={campos + '-solucion'}>Solución</label>
            <textarea id={campos + '-solucion'} required rows={3} maxLength={LIMITE_TEXTO}
              value={solucion} onChange={(evento) => setSolucion(evento.target.value)}
              aria-invalid={Boolean(errores.solucion)}
              aria-describedby={errores.solucion ? campos + '-error-solucion' : undefined} />
            {errores.solucion && <p id={campos + '-error-solucion'} className="error-campo" role="alert">{errores.solucion}</p>}
          </div>
          <div className="campo">
            <label htmlFor={campos + '-duracion_minutos'}>Duración (minutos)</label>
            <input id={campos + '-duracion_minutos'} type="number" min={1} step={1} required inputMode="numeric"
              value={duracion} onChange={(evento) => setDuracion(evento.target.value)}
              aria-invalid={Boolean(errores.duracion_minutos)}
              aria-describedby={errores.duracion_minutos ? campos + '-error-duracion' : undefined} />
            {errores.duracion_minutos && <p id={campos + '-error-duracion'} className="error-campo" role="alert">{errores.duracion_minutos}</p>}
          </div>
          <ConsumosIntervencion grupo={grupoConsumos} consumos={consumos} alCambiar={setConsumos}
            cantidadesInvalidas={mostrarErroresConsumo ? cantidadesInvalidas : []} />
        </fieldset>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="boton boton-primario" disabled={guardando || !puedeCerrar}>
            <Icono nombre="completar" />
            {guardando ? 'Guardando intervención…' : 'Guardar intervención y cerrar'}
          </button>
        </div>
        <p role="status" className="solo-lectores">{guardando ? 'Guardando intervención y cerrando la orden.' : ''}</p>
      </form>
    </Dialogo>
  )
}
