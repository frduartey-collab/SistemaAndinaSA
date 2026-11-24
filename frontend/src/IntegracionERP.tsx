import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ClaveERP, IntegracionERPRespuesta, IntegracionERPSolicitud } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { mensajeError } from './api'

export function IntegracionERP() {
  const { solicitar } = useAuth()
  const [config, setConfig] = useState<IntegracionERPRespuesta | null>(null)
  const [url, setUrl] = useState('')
  const [activo, setActivo] = useState(false)
  const [revision, setRevision] = useState(0)
  const [accion, setAccion] = useState<'guardar' | 'generar' | null>(null)
  const [confirmarRotacion, setConfirmarRotacion] = useState(false)
  const [clave, setClave] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [errorCarga, setErrorCarga] = useState('')
  const [error, setError] = useState('')
  const ocupado = useRef(false)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<IntegracionERPRespuesta>('/integraciones/erp', { signal })
      .then((datos) => {
        if (signal.aborted) return
        setConfig(datos)
        setUrl(datos.webhook_url ?? '')
        setActivo(datos.activo)
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setErrorCarga(mensajeError(fallo, 'No se pudo cargar la integración ERP.'))
      })
    return () => controlador.abort()
  }, [revision, solicitar])

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (ocupado.current || !config) return
    const web = url.trim()
    setAviso('')
    setError('')
    if (web && !esUrlWebhook(web)) {
      setError('Ingresa una URL HTTPS de hasta 500 caracteres sin credenciales, parámetros ni fragmento.')
      return
    }
    if (activo && !config.clave_configurada) {
      setError('Genera una clave API antes de activar la integración.')
      return
    }

    ocupado.current = true
    setAccion('guardar')
    const datos: IntegracionERPSolicitud = { webhook_url: web || null, activo }
    try {
      const guardada = await solicitar<IntegracionERPRespuesta>('/integraciones/erp', {
        method: 'PUT', body: JSON.stringify(datos),
      })
      setConfig(guardada)
      setUrl(guardada.webhook_url ?? '')
      setActivo(guardada.activo)
      setAviso('Configuración ERP guardada.')
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo guardar la configuración.'))
    } finally {
      ocupado.current = false
      setAccion(null)
    }
  }

  async function generar() {
    if (ocupado.current || !config) return
    ocupado.current = true
    setAccion('generar')
    setAviso('')
    setError('')
    try {
      const nueva = await solicitar<ClaveERP>('/integraciones/erp/clave', { method: 'POST' })
      setConfig({ ...config, clave_configurada: true })
      setConfirmarRotacion(false)
      setClave(nueva.api_key)
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo generar la clave API.'))
    } finally {
      ocupado.current = false
      setAccion(null)
    }
  }

  return (
    <>
      <div className="encabezado-pagina"><h1>Integración ERP</h1></div>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      {!config && !errorCarga && <p className="aviso" role="status">Cargando integración ERP…</p>}
      {errorCarga && (
        <div className="aviso aviso-error">
          <p role="alert">{errorCarga}</p>
          <button type="button" className="boton boton-secundario" onClick={() => {
            setErrorCarga(''); setRevision((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar integración</button>
        </div>
      )}
      {error && !confirmarRotacion && <p className="aviso aviso-error" role="alert">{error}</p>}
      {config && (
        <div className="suscripcion-tarjetas">
          <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="erp-configuracion">
            <h2 id="erp-configuracion">Configuración</h2>
            <p className="ayuda">Estado guardado: {config.activo ? 'Activa' : 'Inactiva'}.</p>
            <form className="campos-orden" noValidate onSubmit={guardar} aria-busy={accion === 'guardar'}>
              <fieldset className="campos-orden" disabled={accion !== null}>
                <legend className="solo-lectores">Datos de la integración ERP</legend>
                <div className="campo">
                  <label htmlFor="erp-webhook">URL del webhook</label>
                  <input id="erp-webhook" type="url" maxLength={500} aria-describedby="erp-webhook-ayuda"
                    value={url} onChange={(evento) => setUrl(evento.target.value)} />
                  <p className="ayuda" id="erp-webhook-ayuda">Opcional. Usa una URL HTTPS.</p>
                </div>
                <label className="etiqueta-con-icono">
                  <input type="checkbox" checked={activo} onChange={(evento) => setActivo(evento.target.checked)} />
                  Activar integración
                </label>
              </fieldset>
              <div className="filtros-acciones">
                <button type="submit" className="boton boton-primario" disabled={accion !== null}>
                  <Icono nombre="guardar" />{accion === 'guardar' ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel estado-pagina suscripcion-tarjeta" aria-labelledby="erp-acceso">
            <h2 id="erp-acceso">Acceso desde tu ERP</h2>
            <p className="ayuda">{config.clave_configurada ? 'Hay una clave API configurada.' : 'Todavía no hay una clave API.'}</p>
            <button type="button" className="boton boton-secundario" disabled={accion !== null}
              onClick={() => {
                if (config.clave_configurada) { setError(''); setConfirmarRotacion(true) }
                else void generar()
              }}>
              {accion === 'generar' ? 'Generando…' : config.clave_configurada ? 'Rotar clave API' : 'Generar clave API'}
            </button>
            <ul className="planes-lista">
              <li><span>Costos y existencias <code>GET /api/v1/erp/costos-repuestos</code></span></li>
              <li><span>Sincronización de stock <code>POST /api/v1/erp/sync-stock</code></span></li>
            </ul>
            <p className="ayuda">El ERP se autentica con el encabezado <code>X-API-Key</code>.</p>
          </section>
        </div>
      )}
      {confirmarRotacion && (
        <Dialogo titulo="Rotar clave API" ocupado={accion === 'generar'} alCerrar={() => setConfirmarRotacion(false)}>
          <p>Al generar la nueva clave, la anterior dejará de funcionar. Configura la nueva clave en tu ERP.</p>
          {error && <p className="aviso aviso-error" role="alert">{error}</p>}
          <div className="dialogo-acciones">
            <button className="boton boton-secundario" type="button" disabled={accion === 'generar'}
              onClick={() => setConfirmarRotacion(false)}>Cancelar</button>
            <button className="boton boton-primario" type="button" disabled={accion === 'generar'}
              onClick={() => void generar()}>{accion === 'generar' ? 'Generando…' : 'Confirmar rotación'}</button>
          </div>
        </Dialogo>
      )}
      {clave && <MostrarClave clave={clave} alCerrar={() => setClave(null)} />}
    </>
  )
}

function esUrlWebhook(valor: string) {
  try {
    const direccion = new URL(valor)
    return valor.startsWith('https://') && valor.length <= 500 && !direccion.username && !direccion.password
      && !valor.includes('?') && !valor.includes('#')
  } catch {
    return false
  }
}

function MostrarClave({ clave, alCerrar }: { clave: string; alCerrar: () => void }) {
  const campo = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState('')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave)
      setAviso('Clave copiada.')
    } catch {
      campo.current?.focus()
      campo.current?.select()
      setAviso('La clave está seleccionada. Usa el comando de copiar de tu dispositivo.')
    }
  }

  return (
    <Dialogo titulo="Nueva clave API" alCerrar={alCerrar}>
      <p>Guárdala en un lugar seguro. Al cerrar esta ventana dejará de mostrarse.</p>
      <div className="campo formulario-intervencion">
        <label htmlFor="erp-nueva-clave">Clave API</label>
        <input id="erp-nueva-clave" ref={campo} value={clave} readOnly autoComplete="off" spellCheck={false} />
      </div>
      <p className="ayuda" role="status">{aviso}</p>
      <div className="dialogo-acciones">
        <button className="boton boton-secundario" type="button" onClick={alCerrar}>Cerrar</button>
        <button className="boton boton-primario" type="button" onClick={() => void copiar()}>Copiar clave</button>
      </div>
    </Dialogo>
  )
}
