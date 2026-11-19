import { useId, useRef, useState, type FormEvent } from 'react'
import type {
  MovimientoRepuestoSolicitud, RepuestoActualizarSolicitud, RepuestoCrearSolicitud,
  RepuestoRespuesta, TipoMovimientoRepuesto,
} from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { ErrorApi, mensajeError } from './api'

export type AccionInventario =
  | { tipo: 'crear' }
  | { tipo: 'editar' | 'movimiento' | 'baja'; repuesto: RepuestoRespuesta }

type Props = {
  accion: AccionInventario
  alCerrar: () => void
  alGuardar: (mensaje: string) => void
  alRevisarMovimientos: () => void
}
type EventosDialogo = Pick<Props, 'alCerrar' | 'alGuardar'>
type PropsFormulario = EventosDialogo & { repuesto?: RepuestoRespuesta }
type PropsRepuesto = EventosDialogo & { repuesto: RepuestoRespuesta }
type PropsMovimiento = PropsRepuesto & Pick<Props, 'alRevisarMovimientos'>

function useGuardado(alGuardar: Props['alGuardar'], protegerReenvio = false) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [requiereRevision, setRequiereRevision] = useState(false)
  const ocupado = useRef(false)

  async function guardar(peticion: () => Promise<string>, alternativa: string) {
    if (ocupado.current || requiereRevision) return
    ocupado.current = true
    setGuardando(true)
    setError('')

    try {
      const mensaje = await peticion()
      alGuardar(mensaje)
    } catch (fallo) {
      const rechazoConfirmado = fallo instanceof ErrorApi && fallo.estado >= 400 && fallo.estado < 500
      if (protegerReenvio && !rechazoConfirmado) {
        setRequiereRevision(true)
        setError('No se pudo confirmar el movimiento. Cierra este formulario y revisa las existencias actualizadas antes de registrarlo de nuevo.')
      } else {
        setError(mensajeError(fallo, alternativa))
      }
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  return { guardar, guardando, error, requiereRevision }
}

export function DialogoInventario({ accion, alCerrar, alGuardar, alRevisarMovimientos }: Props) {
  if (accion.tipo === 'crear') return <FormularioRepuesto alCerrar={alCerrar} alGuardar={alGuardar} />
  if (accion.tipo === 'editar') {
    return <FormularioRepuesto repuesto={accion.repuesto} alCerrar={alCerrar} alGuardar={alGuardar} />
  }
  if (accion.tipo === 'movimiento') {
    return <MovimientoRepuesto repuesto={accion.repuesto} alCerrar={alCerrar} alGuardar={alGuardar}
      alRevisarMovimientos={alRevisarMovimientos} />
  }
  return <BajaRepuesto repuesto={accion.repuesto} alCerrar={alCerrar} alGuardar={alGuardar} />
}

function FormularioRepuesto({ repuesto, alCerrar, alGuardar }: PropsFormulario) {
  const { solicitar } = useAuth()
  const campos = useId()
  const [codigo, setCodigo] = useState(repuesto?.codigo ?? '')
  const [nombre, setNombre] = useState(repuesto?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(repuesto?.descripcion ?? '')
  const [minimo, setMinimo] = useState(String(repuesto?.stock_minimo ?? 0))
  const [invalidos, setInvalidos] = useState<{ codigo?: string; nombre?: string; minimo?: string }>({})
  const { guardar, guardando, error } = useGuardado(alGuardar)

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    const codigoIngresado = codigo.trim()
    const nombreIngresado = nombre.trim()
    const descripcionIngresada = descripcion.trim()
    const stockMinimo = Number(minimo)
    const errores: typeof invalidos = {}
    if (!repuesto && !/^[A-Za-z0-9._-]{1,60}$/.test(codigoIngresado)) {
      errores.codigo = 'Usa letras, números, puntos, guiones o guiones bajos.'
    }
    if (!nombreIngresado) errores.nombre = 'Ingresa el nombre del repuesto.'
    if (!minimo.trim() || !Number.isSafeInteger(stockMinimo) || stockMinimo < 0) {
      errores.minimo = 'Ingresa un número entero igual o mayor que cero.'
    }
    setInvalidos(errores)
    const campo = Object.keys(errores)[0]
    if (campo) {
      document.getElementById(campos + '-' + campo)?.focus()
      return
    }

    const datos: RepuestoActualizarSolicitud = {
      nombre: nombreIngresado,
      stock_minimo: stockMinimo,
      ...(descripcionIngresada ? { descripcion: descripcionIngresada } : {}),
    }
    void guardar(async () => {
      if (repuesto) {
        const actualizado = await solicitar<RepuestoRespuesta>(`/repuestos/${repuesto.id}`, {
          method: 'PUT', body: JSON.stringify(datos),
        })
        return 'Repuesto ' + actualizado.codigo + ' actualizado.'
      }
      const nuevo: RepuestoCrearSolicitud = { ...datos, codigo: codigoIngresado.toUpperCase() }
      const creado = await solicitar<RepuestoRespuesta>('/repuestos', { method: 'POST', body: JSON.stringify(nuevo) })
      return 'Repuesto ' + creado.codigo + ' creado. Registra un movimiento para ingresar unidades.'
    }, 'No se pudo guardar el repuesto. Intenta nuevamente.')
  }

  return (
    <Dialogo titulo={repuesto ? 'Editar repuesto' : 'Nuevo repuesto'} ocupado={guardando} alCerrar={alCerrar}>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form onSubmit={enviar} noValidate aria-busy={guardando}>
        <fieldset className="campos-orden" disabled={guardando}>
          <legend className="solo-lectores">Datos del repuesto</legend>
          <div className="campo">
            <label htmlFor={campos + '-codigo'}>Código</label>
            <input id={campos + '-codigo'} value={codigo} onChange={(evento) => setCodigo(evento.target.value)}
              readOnly={Boolean(repuesto)} required={!repuesto} maxLength={60} spellCheck={false}
              aria-invalid={Boolean(invalidos.codigo)} aria-describedby={invalidos.codigo ? campos + '-codigo-error' : undefined} />
            {invalidos.codigo && <p className="error-campo" role="alert" id={campos + '-codigo-error'}>{invalidos.codigo}</p>}
          </div>
          <div className="campo">
            <label htmlFor={campos + '-nombre'}>Nombre</label>
            <input id={campos + '-nombre'} value={nombre} onChange={(evento) => setNombre(evento.target.value)}
              required maxLength={150} aria-invalid={Boolean(invalidos.nombre)}
              aria-describedby={invalidos.nombre ? campos + '-nombre-error' : undefined} />
            {invalidos.nombre && <p className="error-campo" role="alert" id={campos + '-nombre-error'}>{invalidos.nombre}</p>}
          </div>
          <div className="campo">
            <label htmlFor={campos + '-descripcion'}>Descripción (opcional)</label>
            <textarea id={campos + '-descripcion'} rows={3} value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)} maxLength={1000} />
          </div>
          <div className="campo">
            <label htmlFor={campos + '-minimo'}>Stock mínimo</label>
            <input id={campos + '-minimo'} value={minimo} onChange={(evento) => setMinimo(evento.target.value)}
              required type="number" min={0} step={1} inputMode="numeric" aria-invalid={Boolean(invalidos.minimo)}
              aria-describedby={invalidos.minimo ? campos + '-minimo-error' : campos + '-minimo-ayuda'} />
            {invalidos.minimo
              ? <p className="error-campo" role="alert" id={campos + '-minimo-error'}>{invalidos.minimo}</p>
              : <p className="ayuda" id={campos + '-minimo-ayuda'}>Por debajo de este valor se indica stock bajo.</p>}
          </div>
        </fieldset>
        <div className="dialogo-acciones">
          <button className="boton boton-secundario" type="button" disabled={guardando} onClick={alCerrar}>Cancelar</button>
          <button className="boton boton-primario" type="submit" disabled={guardando}>
            <Icono nombre="guardar" />{guardando ? 'Guardando…' : 'Guardar repuesto'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}

function MovimientoRepuesto({ repuesto, alCerrar, alGuardar, alRevisarMovimientos }: PropsMovimiento) {
  const { solicitar } = useAuth()
  const campos = useId()
  const [tipo, setTipo] = useState<TipoMovimientoRepuesto>('ENTRADA')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorCantidad, setErrorCantidad] = useState('')
  const campoCantidad = useRef<HTMLInputElement>(null)
  const { guardar, guardando, error, requiereRevision } = useGuardado(alGuardar, true)
  const volver = requiereRevision ? alRevisarMovimientos : alCerrar

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando || requiereRevision) return
    const unidades = Number(cantidad)
    if (!Number.isSafeInteger(unidades) || unidades < 1) {
      setErrorCantidad('Ingresa un número entero de unidades mayor que cero.')
      campoCantidad.current?.focus()
      return
    }
    setErrorCantidad('')
    const motivoIngresado = motivo.trim()
    const datos: MovimientoRepuestoSolicitud = {
      tipo, cantidad: unidades, ...(motivoIngresado ? { motivo: motivoIngresado } : {}),
    }
    void guardar(async () => {
      const actualizado = await solicitar<RepuestoRespuesta>(`/repuestos/${repuesto.id}/movimientos`, {
        method: 'POST', body: JSON.stringify(datos),
      })
      return (tipo === 'ENTRADA' ? 'Entrada' : 'Salida') + ' registrada para ' + actualizado.codigo
        + '. Stock actual: ' + actualizado.stock_actual + '.'
    }, 'No se pudo registrar el movimiento. Intenta nuevamente.')
  }

  return (
    <Dialogo titulo="Registrar movimiento" ocupado={guardando} alCerrar={volver}>
      <p className="nombre-detalle">{repuesto.codigo} · {repuesto.nombre}</p>
      <p className="ayuda">Stock actual: {repuesto.stock_actual}</p>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form className="formulario-intervencion" noValidate onSubmit={enviar} aria-busy={guardando}>
        <fieldset className="campos-orden" disabled={guardando || requiereRevision}>
          <legend className="solo-lectores">Datos del movimiento</legend>
          <div className="campo">
            <label htmlFor={campos + '-tipo'}>Tipo de movimiento</label>
            <select id={campos + '-tipo'} value={tipo} onChange={(evento) => {
              setTipo(evento.target.value === 'SALIDA' ? 'SALIDA' : 'ENTRADA')
            }}>
              <option value="ENTRADA">Entrada</option>
              <option value="SALIDA">Salida</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor={campos + '-cantidad'}>Cantidad</label>
            <input ref={campoCantidad} id={campos + '-cantidad'} type="number" min={1} step={1} inputMode="numeric"
              required value={cantidad} onChange={(evento) => setCantidad(evento.target.value)}
              aria-invalid={Boolean(errorCantidad)} aria-describedby={errorCantidad ? campos + '-cantidad-error' : undefined} />
            {errorCantidad && <p className="error-campo" role="alert" id={campos + '-cantidad-error'}>{errorCantidad}</p>}
          </div>
          <div className="campo">
            <label htmlFor={campos + '-motivo'}>Motivo (opcional)</label>
            <textarea id={campos + '-motivo'} rows={3} maxLength={500} value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)} />
          </div>
        </fieldset>
        <div className="dialogo-acciones">
          <button className="boton boton-secundario" type="button" disabled={guardando} onClick={volver}>
            {requiereRevision ? 'Revisar existencias' : 'Cancelar'}
          </button>
          <button className="boton boton-primario" type="submit" disabled={guardando || requiereRevision}>
            <Icono nombre="guardar" />{guardando ? 'Registrando…' : 'Registrar movimiento'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}

function BajaRepuesto({ repuesto, alCerrar, alGuardar }: PropsRepuesto) {
  const { solicitar } = useAuth()
  const { guardar, guardando, error } = useGuardado(alGuardar)

  function confirmar() {
    if (repuesto.stock_actual !== 0) return
    void guardar(async () => {
      await solicitar<void>(`/repuestos/${repuesto.id}`, { method: 'DELETE' })
      return 'Repuesto ' + repuesto.codigo + ' dado de baja. El historial se conserva.'
    }, 'No se pudo dar de baja el repuesto. Intenta nuevamente.')
  }

  return (
    <Dialogo titulo="Dar de baja repuesto" ocupado={guardando} alCerrar={alCerrar}>
      <p>¿Dar de baja <strong>{repuesto.codigo} · {repuesto.nombre}</strong>?</p>
      <p>El código seguirá reservado y los movimientos y consumos quedarán en el historial.</p>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <div className="dialogo-acciones">
        <button className="boton boton-secundario" type="button" disabled={guardando} onClick={alCerrar}>Cancelar</button>
        <button className="boton boton-peligro" type="button" disabled={guardando || repuesto.stock_actual !== 0} onClick={confirmar}>
          <Icono nombre="baja" />{guardando ? 'Dando de baja…' : 'Dar de baja'}
        </button>
      </div>
    </Dialogo>
  )
}
