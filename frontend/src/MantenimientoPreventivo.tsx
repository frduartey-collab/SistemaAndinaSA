import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type {
  ActivoRespuesta, EvaluacionPreventivosRespuesta, PlanPreventivoActualizarSolicitud,
  PlanPreventivoCrearSolicitud, PlanPreventivoRespuesta, TecnicoResumen, TipoDisparadorPreventivo,
} from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { SelectorOrden } from './SelectorOrden'
import { mensajeError } from './api'

const TAMANO_SELECTOR = 5
const MAXIMO_DIAS = 36500
const MAXIMO_HORAS = Number.MAX_SAFE_INTEGER
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', dateStyle: 'medium' })
const FORMATO_NUMERO = new Intl.NumberFormat('es-CL', { maximumSignificantDigits: 17 })

export function MantenimientoPreventivo() {
  const { solicitar, puedeEscribir, plan } = useAuth()
  const [planes, setPlanes] = useState<PlanPreventivoRespuesta[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)
  const [accion, setAccion] = useState<'evaluar' | number | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const enCurso = useRef(false)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<PlanPreventivoRespuesta[]>('/preventivos', { signal })
      .then((respuesta) => { if (!signal.aborted) setPlanes(respuesta) })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setErrorCarga(mensajeError(fallo, 'No se pudieron cargar los planes preventivos.'))
      })
      .finally(() => { if (!signal.aborted) setCargando(false) })
    return () => controlador.abort()
  }, [revision, solicitar])

  function recargar() {
    setErrorCarga('')
    setCargando(true)
    setRevision((anterior) => anterior + 1)
  }

  function planCreado(nuevo: PlanPreventivoRespuesta) {
    setCreando(false)
    setPlanes((anteriores) => [nuevo, ...(anteriores ?? []).filter(({ id }) => id !== nuevo.id)])
    setAviso('Plan preventivo #' + nuevo.id + ' creado.')
    recargar()
  }

  async function ejecutar(operacion: 'evaluar' | PlanPreventivoRespuesta) {
    if (enCurso.current || creando || cargando || !puedeEscribir) return
    enCurso.current = true
    setAccion(operacion === 'evaluar' ? operacion : operacion.id)
    setAviso('')
    setErrorAccion('')

    try {
      if (operacion === 'evaluar') {
        const { generadas, ordenes_ids } = await solicitar<EvaluacionPreventivosRespuesta>('/preventivos/evaluar', { method: 'POST' })
        if (generadas === 0) setAviso('Evaluación completada. No se generaron órdenes.')
        else if (generadas === 1) setAviso('Se generó la orden preventiva #' + ordenes_ids[0] + '.')
        else setAviso('Se generaron ' + generadas + ' órdenes preventivas: ' + ordenes_ids.map((id) => '#' + id).join(', ') + '.')
      } else {
        const datos: PlanPreventivoActualizarSolicitud = { activo: !operacion.activo }
        const actualizado = await solicitar<PlanPreventivoRespuesta>(`/preventivos/${operacion.id}`, {
          method: 'PATCH', body: JSON.stringify(datos),
        })
        setPlanes((anteriores) => anteriores?.map((item) => item.id === actualizado.id ? actualizado : item) ?? null)
        setAviso('Plan #' + actualizado.id + (actualizado.activo ? ' activado.' : ' pausado.'))
      }
      recargar()
    } catch (fallo) {
      setErrorAccion(mensajeError(fallo, operacion === 'evaluar'
        ? 'No se pudieron evaluar los planes.' : 'No se pudo actualizar el estado del plan.'))
      recargar()
    } finally {
      enCurso.current = false
      setAccion(null)
    }
  }

  const accionesOcupadas = accion !== null || cargando

  return (
    <>
      <div className="encabezado-pagina">
        <h1>Mantenimiento preventivo</h1>
        {puedeEscribir && (
          <div className="filtros-acciones">
            <button type="button" className="boton boton-secundario" disabled={accionesOcupadas}
              onClick={() => void ejecutar('evaluar')}>
              <Icono nombre="sincronizar" />{accion === 'evaluar' ? 'Evaluando…' : 'Evaluar y generar órdenes'}
            </button>
            <button type="button" className="boton boton-primario" disabled={accion !== null}
              onClick={() => { setAviso(''); setErrorAccion(''); setCreando(true) }}>
              <Icono nombre="crear" />Nuevo plan preventivo
            </button>
          </div>
        )}
      </div>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      <p className="solo-lectores" role="status">
        {accion === 'evaluar' ? 'Evaluando planes preventivos…' : accion !== null ? 'Actualizando el plan…' : ''}
      </p>
      {errorAccion && <p className="aviso aviso-error" role="alert">{errorAccion}</p>}
      {cargando && <p className="aviso" role="status">Cargando planes preventivos…</p>}
      {errorCarga && (
        <div className="aviso aviso-error">
          <p role="alert">{errorCarga}</p>
          <button type="button" className="boton boton-secundario" onClick={recargar}>
            <Icono nombre="sincronizar" />Reintentar planes
          </button>
        </div>
      )}
      {planes && (
        <section className="panel lista-ordenes" aria-label="Planes preventivos" aria-busy={cargando}>
          {planes.length === 0 ? <p>Aún no hay planes preventivos.</p> : (
            <ul className="ordenes-resultados">
              {planes.map((item) => {
                const porFecha = item.tipo_disparador === 'FECHA'
                const accionPlan = item.activo ? 'Pausar' : 'Activar'
                const intervalo = porFecha ? item.intervalo_dias : item.intervalo_horas
                return (
                  <li className="orden" key={item.id}>
                    <div className="orden-cabecera">
                      <div>
                        <p className="ayuda">Plan #{item.id}</p>
                        <h2>{item.equipo_codigo} · {item.equipo_nombre}</h2>
                      </div>
                      <div className="filtros-acciones">
                        <span className={'insignia ' + (item.activo ? 'operativo' : 'estado-equipo')}>
                          {item.activo ? 'Activo' : 'Pausado'}
                        </span>
                        {plan === 'EMPRESA' && item.alerta_vencimiento && (
                          <span className="insignia orden-pendiente"><Icono nombre="aviso" />Vencido</span>
                        )}
                      </div>
                    </div>
                    <p className="descripcion-falla">{item.descripcion}</p>
                    <dl className="orden-datos">
                      {puedeEscribir && <div><dt>Técnico asignado</dt><dd>#{item.tecnico_id}</dd></div>}
                      <div><dt>Tipo de disparador</dt><dd>{porFecha ? 'Por fecha' : 'Por horas de uso'}</dd></div>
                      <div><dt>Intervalo</dt><dd>{intervalo === null ? 'Sin intervalo'
                        : FORMATO_NUMERO.format(intervalo) + (porFecha ? ' días' : ' h')}</dd></div>
                      <div><dt>{porFecha ? 'Próxima fecha' : 'Próximas horas'}</dt><dd>{porFecha
                        ? (item.proxima_fecha ? <time dateTime={item.proxima_fecha}>{FORMATO_FECHA.format(new Date(item.proxima_fecha + 'T00:00:00Z'))}</time> : 'Sin programar')
                        : (item.proximas_horas === null ? 'Sin programar' : FORMATO_NUMERO.format(item.proximas_horas) + ' h')}</dd></div>
                      <div><dt>Orden abierta</dt><dd>{item.orden_abierta_id === null ? 'Sin orden abierta' : '#' + item.orden_abierta_id}</dd></div>
                    </dl>
                    {puedeEscribir && (
                      <button type="button" className="boton boton-secundario" disabled={accionesOcupadas}
                        aria-label={accionPlan + ' plan #' + item.id} onClick={() => void ejecutar(item)}>
                        {accion === item.id ? 'Actualizando…' : accionPlan}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
      {creando && puedeEscribir && <CrearPlanPreventivo alCerrar={() => setCreando(false)} alCrear={planCreado} />}
    </>
  )
}

function CrearPlanPreventivo({ alCerrar, alCrear }: {
  alCerrar: () => void
  alCrear: (plan: PlanPreventivoRespuesta) => void
}) {
  const { solicitar, puedeEscribir, plan } = useAuth()
  const campos = useId()
  const [equipo, setEquipo] = useState<ActivoRespuesta | null>(null)
  const [tecnico, setTecnico] = useState<TecnicoResumen | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [disparador, setDisparador] = useState<TipoDisparadorPreventivo>('FECHA')
  const [dias, setDias] = useState('')
  const [fecha, setFecha] = useState('')
  const [intervaloHoras, setIntervaloHoras] = useState('')
  const [proximasHoras, setProximasHoras] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const enCurso = useRef(false)
  const porFecha = disparador === 'FECHA'

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enCurso.current || !puedeEscribir || (!porFecha && plan !== 'EMPRESA')) return
    if (!equipo || !tecnico || !descripcion.trim()) {
      setError('Selecciona un equipo y un técnico y escribe la descripción del trabajo.')
      return
    }

    const base = { equipo_id: equipo.id, tecnico_id: tecnico.id, descripcion: descripcion.trim() }
    const datos: PlanPreventivoCrearSolicitud = porFecha
      ? { ...base, tipo_disparador: 'FECHA', intervalo_dias: Number(dias), proxima_fecha: fecha }
      : { ...base, tipo_disparador: 'HORAS_USO', intervalo_horas: Number(intervaloHoras), proximas_horas: Number(proximasHoras) }
    if (!porFecha && Number(intervaloHoras) <= 0) {
      setError('El intervalo de horas debe ser mayor que cero.')
      document.getElementById(campos + '-intervalo')?.focus()
      return
    }

    enCurso.current = true
    setGuardando(true)
    setError('')
    try {
      const nuevo = await solicitar<PlanPreventivoRespuesta>('/preventivos', { method: 'POST', body: JSON.stringify(datos) })
      alCrear(nuevo)
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo crear el plan preventivo.'))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo="Nuevo plan preventivo" amplio ocupado={guardando} alCerrar={alCerrar}>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form aria-busy={guardando} onSubmit={guardar}>
        <fieldset className="campos-orden" disabled={guardando}>
          <legend className="solo-lectores">Datos del plan preventivo</legend>
          <SelectorOrden<ActivoRespuesta>
            titulo="Equipo" grupo={campos + '-equipo'} seleccionado={equipo} alElegir={setEquipo}
            ruta={(page, q) => `/activos?${new URLSearchParams({ page: String(page), size: String(TAMANO_SELECTOR), q })}`}
            etiqueta={(dato) => dato.codigo + ' · ' + dato.nombre} detalle={(dato) => dato.ubicacion}
            buscar etiquetaBusqueda="Buscar equipo por código o nombre" sinResultados="No se encontraron equipos."
          />
          <SelectorOrden<TecnicoResumen>
            titulo="Técnico asignado" grupo={campos + '-tecnico'} seleccionado={tecnico} alElegir={setTecnico}
            ruta={(page, q) => `/ordenes/tecnicos?${new URLSearchParams({ page: String(page), size: String(TAMANO_SELECTOR), q })}`}
            etiqueta={(dato) => dato.nombre + ' · #' + dato.id} buscar sinResultados="No se encontraron técnicos activos."
          />
          <div className="campo">
            <label htmlFor={campos + '-descripcion'}>Descripción del trabajo</label>
            <textarea id={campos + '-descripcion'} rows={3} required maxLength={2000} value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor={campos + '-disparador'}>Tipo de disparador</label>
            <select id={campos + '-disparador'} value={disparador}
              onChange={(evento) => setDisparador(evento.target.value === 'HORAS_USO' ? 'HORAS_USO' : 'FECHA')}>
              <option value="FECHA">Por fecha</option>
              {plan === 'EMPRESA' && <option value="HORAS_USO">Por horas de uso</option>}
            </select>
          </div>
          {porFecha ? (
            <>
              <div className="campo">
                <label htmlFor={campos + '-dias'}>Intervalo (días)</label>
                <input id={campos + '-dias'} type="number" required min={1} max={MAXIMO_DIAS} step={1} value={dias}
                  onChange={(evento) => setDias(evento.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor={campos + '-fecha'}>Próxima fecha</label>
                <input id={campos + '-fecha'} type="date" required min="0001-01-01" max="9999-12-31" value={fecha}
                  onChange={(evento) => setFecha(evento.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="campo">
                <label htmlFor={campos + '-intervalo'}>Intervalo (horas)</label>
                <input id={campos + '-intervalo'} type="number" required min={0} max={MAXIMO_HORAS} step="any" value={intervaloHoras}
                  onChange={(evento) => setIntervaloHoras(evento.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor={campos + '-horas'}>Próximas horas</label>
                <input id={campos + '-horas'} type="number" required min={0} max={MAXIMO_HORAS} step="any" value={proximasHoras}
                  onChange={(evento) => setProximasHoras(evento.target.value)} />
              </div>
            </>
          )}
        </fieldset>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario" disabled={guardando} onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton-primario" disabled={guardando}>
            <Icono nombre="guardar" />{guardando ? 'Guardando…' : 'Guardar plan preventivo'}
          </button>
        </div>
        <p className="solo-lectores" role="status">{guardando ? 'Guardando plan preventivo…' : ''}</p>
      </form>
    </Dialogo>
  )
}
