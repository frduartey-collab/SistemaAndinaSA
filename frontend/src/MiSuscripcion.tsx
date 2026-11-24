import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { ResumenSuscripcion, SuscripcionRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { mensajeError } from './api'
import { PLANES, PESOS, leerPlan } from './planes'

const FECHA = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' })

type Accion = 'checkout' | 'simular' | 'cancelar'

export function MiSuscripcion() {
  const { estado, plan, solicitar, actualizarUsuario } = useAuth()
  const [parametros, setParametros] = useSearchParams()
  const [resumen, setResumen] = useState<ResumenSuscripcion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [cancelacion, setCancelacion] = useState<SuscripcionRespuesta | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorCarga, setErrorCarga] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [errorSesion, setErrorSesion] = useState('')
  const ocupado = useRef(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const planElegido = leerPlan(parametros) ?? resumen?.plan_actual ?? 'PARTICULAR'
  const planActual = resumen?.plan_actual
  const deshabilitado = cargando || accion !== null

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<ResumenSuscripcion>('/suscripciones', { signal })
      .then((datos) => {
        if (signal.aborted) return
        setResumen(datos)
        setCancelacion((anterior) => anterior && (datos.activa?.id === anterior.id || datos.pendiente?.id === anterior.id) ? anterior : null)
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setErrorCarga(mensajeError(fallo, 'No se pudo cargar tu suscripción.'))
      })
      .finally(() => { if (!signal.aborted) setCargando(false) })
    return () => controlador.abort()
  }, [revision, solicitar])

  useEffect(() => {
    if (!planActual || !plan || planActual === plan) {
      setErrorSesion('')
      return
    }
    let vigente = true
    actualizarUsuario()
      .then(() => { if (vigente) setErrorSesion('') })
      .catch(() => {
        if (vigente) setErrorSesion('El plan ya se actualizó. Reintenta la carga para actualizar los permisos de esta sesión.')
      })
    return () => { vigente = false }
  }, [planActual, plan, actualizarUsuario, revision])

  function recargar() {
    setCargando(true)
    setErrorCarga('')
    setRevision((anterior) => anterior + 1)
  }

  async function ejecutar(operacion: Accion, suscripcion?: SuscripcionRespuesta) {
    if (ocupado.current || cargando || !resumen || estado.tipo !== 'activa' || estado.usuario.rol !== 'JEFATURA') return
    if (operacion === 'checkout' && (resumen.pendiente || resumen.activa?.plan === planElegido)) return
    if (operacion === 'simular' && (!resumen.simulacion_disponible || !suscripcion || resumen.pendiente?.id !== suscripcion.id)) return

    ocupado.current = true
    setAccion(operacion)
    setErrorAccion('')
    setAviso('')
    try {
      if (operacion === 'checkout') {
        const pendiente = await solicitar<SuscripcionRespuesta>('/suscripciones/checkout', {
          method: 'POST', body: JSON.stringify({ plan: planElegido }),
        })
        setResumen({ ...resumen, pendiente })
        setAviso('Solicitud creada. El plan se mantiene hasta que se confirme el pago.')
        requestAnimationFrame(() => titulo.current?.focus())
      } else if (suscripcion) {
        const endpoint = operacion === 'simular' ? 'simular-pago' : 'cancelar'
        const actualizado = await solicitar<ResumenSuscripcion>(`/suscripciones/${suscripcion.id}/${endpoint}`, {
          method: 'POST',
        })
        setResumen(actualizado)
        setCancelacion(null)
        setAviso(operacion === 'simular'
          ? 'Pago simulado confirmado. Plan actual ' + PLANES[actualizado.plan_actual].nombre + '.'
          : suscripcion.estado === 'ACTIVA' ? 'Suscripción cancelada. Ahora tienes el Plan Particular.' : 'Solicitud cancelada.')
        requestAnimationFrame(() => titulo.current?.focus())
      }
    } catch (fallo) {
      setErrorAccion(mensajeError(fallo, 'No se pudo completar la solicitud.'))
      recargar()
    } finally {
      ocupado.current = false
      setAccion(null)
    }
  }

  function iniciarCheckout(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void ejecutar('checkout')
  }

  function abrirCancelacion(suscripcion: SuscripcionRespuesta) {
    setErrorAccion('')
    setCancelacion(suscripcion)
  }

  const datosPlan = PLANES[planElegido]
  const yaActivo = resumen?.activa?.plan === planElegido
  const actividad = accion === 'checkout' ? 'Creando solicitud…'
    : accion === 'simular' ? 'Simulando el pago…' : accion === 'cancelar' ? 'Cancelando…' : ''

  return (
    <>
      <div className="encabezado-pagina">
        <h1 ref={titulo} tabIndex={-1}>Mi suscripción</h1>
        <button type="button" className="boton boton-secundario" disabled={deshabilitado} onClick={recargar}>
          <Icono nombre="sincronizar" />{errorCarga || errorSesion ? 'Reintentar suscripción' : 'Actualizar suscripción'}
        </button>
      </div>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      <p className="solo-lectores" role="status">{actividad}</p>
      {cargando && <p className="aviso" role="status">Cargando suscripción…</p>}
      {errorCarga && <p className="aviso aviso-error" role="alert">{errorCarga}</p>}
      {errorAccion && !cancelacion && <p className="aviso aviso-error" role="alert">{errorAccion}</p>}
      {errorSesion && <p className="aviso aviso-error" role="alert">{errorSesion}</p>}

      {resumen && (
        <>
          <div className="suscripcion-tarjetas">
            <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="suscripcion-actual">
              <h2 id="suscripcion-actual">Plan actual</h2>
              <p className="suscripcion-plan">{PLANES[resumen.plan_actual].nombre}</p>
              {resumen.activa ? (
                <>
                  <DatosSuscripcion suscripcion={resumen.activa} />
                  <button type="button" className="boton boton-secundario" disabled={deshabilitado}
                    onClick={() => { if (resumen.activa) abrirCancelacion(resumen.activa) }}>
                    Cancelar suscripción
                  </button>
                </>
              ) : <p className="ayuda">No hay una suscripción de pago activa.</p>}
            </section>

            {resumen.pendiente ? (
              <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="suscripcion-pendiente">
                <h2 id="suscripcion-pendiente">Solicitud pendiente</h2>
                <p className="suscripcion-plan">{PLANES[resumen.pendiente.plan].nombre}</p>
                <DatosSuscripcion suscripcion={resumen.pendiente} />
                {resumen.simulacion_disponible ? (
                  <p className="ayuda">El modo de prueba no procesa tarjetas ni cargos reales.</p>
                ) : <p className="ayuda">En espera de confirmación de pago. La simulación está deshabilitada.</p>}
                <div className="filtros-acciones">
                  {resumen.simulacion_disponible && (
                    <button type="button" className="boton boton-primario" disabled={deshabilitado}
                      onClick={() => void ejecutar('simular', resumen.pendiente ?? undefined)}>
                      <Icono nombre="pago" />{accion === 'simular' ? 'Simulando…' : 'Simular pago'}
                    </button>
                  )}
                  <button type="button" className="boton boton-secundario" disabled={deshabilitado}
                    onClick={() => { if (resumen.pendiente) abrirCancelacion(resumen.pendiente) }}>
                    Cancelar solicitud
                  </button>
                </div>
              </section>
            ) : (
              <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="suscripcion-contratar">
                <h2 id="suscripcion-contratar">Contratar un plan</h2>
                <form className="suscripcion-tarjeta" aria-busy={accion === 'checkout'} onSubmit={iniciarCheckout}>
                  <div className="campo">
                    <label htmlFor="suscripcion-plan-elegido">Plan para contratar</label>
                    <select id="suscripcion-plan-elegido" value={planElegido} disabled={deshabilitado}
                      onChange={(evento) => setParametros({ plan: evento.target.value }, { replace: true })}>
                      <option value="PARTICULAR">Particular</option>
                      <option value="EMPRESA">Empresa</option>
                    </select>
                  </div>
                  <p className="suscripcion-monto"><strong>{PESOS.format(datosPlan.mensualidad)}</strong> CLP al mes</p>
                  <p className="ayuda">{datosPlan.puestaEnMarcha > 0
                    ? 'Puesta en marcha por primera activación: ' + PESOS.format(datosPlan.puestaEnMarcha) + ' CLP.'
                    : 'Activación sin costo.'}</p>
                  {yaActivo && <p className="ayuda">Ya tienes una suscripción activa a este plan.</p>}
                  <button type="submit" className="boton boton-primario" disabled={deshabilitado || yaActivo}>
                    <Icono nombre="siguiente" />{accion === 'checkout' ? 'Creando solicitud…' : 'Iniciar checkout'}
                  </button>
                </form>
              </section>
            )}
          </div>

          <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="suscripcion-cobros">
            <h2 id="suscripcion-cobros">Historial de cobros</h2>
            {resumen.cobros.length === 0 ? <p className="ayuda">Aún no hay cobros registrados.</p> : (
              <div className="tabla-contenedor" role="region" aria-label="Tabla del historial de cobros en pesos chilenos" tabIndex={0}>
                <table>
                  <thead><tr>
                    <th scope="col">Fecha</th><th scope="col">Plan</th><th scope="col">Puesta en marcha (CLP)</th>
                    <th scope="col">Total (CLP)</th><th scope="col">Referencia de pago</th>
                  </tr></thead>
                  <tbody>
                    {resumen.cobros.map((cobro) => (
                      <tr key={cobro.id}>
                        <td><time dateTime={cobro.fecha}>{FECHA_HORA.format(new Date(cobro.fecha))}</time></td>
                        <td>{PLANES[cobro.plan].nombre}</td>
                        <td>{PESOS.format(cobro.puesta_marcha_clp)}</td>
                        <td><strong>{PESOS.format(cobro.monto_clp)}</strong></td>
                        <td>{cobro.metodo_pago_ref ?? 'Sin referencia'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {cancelacion && (
        <Dialogo titulo={cancelacion.estado === 'ACTIVA' ? 'Cancelar suscripción' : 'Cancelar solicitud'}
          ocupado={accion === 'cancelar'} alCerrar={() => setCancelacion(null)}>
          <p>¿Confirmas la cancelación del plan {PLANES[cancelacion.plan].nombre}?</p>
          <p>{cancelacion.estado === 'ACTIVA' ? 'Tu organización quedará en el Plan Particular.' : 'Tu plan actual seguirá activo.'}</p>
          {errorAccion && <p className="aviso aviso-error" role="alert">{errorAccion}</p>}
          {errorCarga && <p className="aviso aviso-error" role="alert">{errorCarga}</p>}
          <div className="dialogo-acciones">
            <button type="button" className="boton boton-secundario" disabled={accion === 'cancelar'}
              onClick={() => { setErrorAccion(''); setCancelacion(null) }}>Volver</button>
            <button type="button" className="boton boton-peligro" disabled={deshabilitado}
              onClick={() => void ejecutar('cancelar', cancelacion)}>
              {accion === 'cancelar' ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </Dialogo>
      )}
    </>
  )
}

function DatosSuscripcion({ suscripcion }: { suscripcion: SuscripcionRespuesta }) {
  return (
    <dl className="orden-datos">
      <div><dt>Mensualidad</dt><dd>{PESOS.format(suscripcion.monto_clp)} CLP</dd></div>
      {suscripcion.puesta_marcha_clp > 0 && (
        <div><dt>Puesta en marcha</dt><dd>{PESOS.format(suscripcion.puesta_marcha_clp)} CLP</dd></div>
      )}
      {suscripcion.fecha_renovacion && (
        <div><dt>Próxima renovación</dt><dd><time dateTime={suscripcion.fecha_renovacion}>
          {FECHA.format(new Date(suscripcion.fecha_renovacion))}
        </time></dd></div>
      )}
      {suscripcion.metodo_pago_ref && <div><dt>Referencia de pago</dt><dd>{suscripcion.metodo_pago_ref}</dd></div>}
    </dl>
  )
}
