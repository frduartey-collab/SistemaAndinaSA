import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { SedeRespuesta, SedeSolicitud } from '../../backend/src/dominio'
import { AsignacionSedes } from './AsignacionSedes'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { mensajeError } from './api'

type Vista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; sedes: SedeRespuesta[] }

type Accion =
  | { tipo: 'crear' }
  | { tipo: 'editar' | 'baja'; sede: SedeRespuesta }

export function GestionSedes() {
  const { solicitar, puedeEscribir, estado, plan } = useAuth()
  const usuario = estado.tipo === 'activa' ? estado.usuario : null
  const sedeFija = usuario?.rol === 'SUPERVISOR' ? usuario.sede_id : undefined
  const puedeGestionar = puedeEscribir && sedeFija === undefined
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' })
  const [revision, setRevision] = useState(0)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [aviso, setAviso] = useState('')
  const titulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador

    solicitar<SedeRespuesta[]>('/sedes', { signal })
      .then((sedes) => {
        if (!signal.aborted) setVista({ tipo: 'lista', sedes: sedes.filter((sede) => sedeFija === undefined || sede.id === sedeFija) })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudieron cargar las sedes.'),
        })
      })

    return () => controlador.abort()
  }, [revision, solicitar, sedeFija])

  function refrescar() {
    setVista({ tipo: 'cargando' })
    setRevision((anterior) => anterior + 1)
  }

  function operacionTerminada(mensaje: string) {
    setAccion(null)
    setAviso(mensaje)
    refrescar()
    requestAnimationFrame(() => titulo.current?.focus())
  }

  return (
    <>
      <div className="encabezado-pagina">
        <h1 ref={titulo} tabIndex={-1}>Sedes y Sucursales</h1>
        {puedeGestionar && (
          <button type="button" className="boton boton-primario" onClick={() => setAccion({ tipo: 'crear' })}>
            <Icono nombre="crear" />Nueva sede
          </button>
        )}
      </div>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      {vista.tipo === 'cargando' && <p className="aviso" role="status">Cargando sedes…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button type="button" className="boton boton-secundario" onClick={refrescar}>
            <Icono nombre="sincronizar" />Reintentar sedes
          </button>
        </div>
      )}
      {vista.tipo === 'lista' && (
        <section className="panel reportes" aria-label="Listado de sedes">
          {vista.sedes.length === 0 ? (
            <p>Aún no hay sedes registradas.</p>
          ) : (
            <>
              <p className="ayuda">{vista.sedes.length === 1 ? '1 sede' : vista.sedes.length + ' sedes'}</p>
              <ul className="lista-reportes">
                {vista.sedes.map((sede) => (
                  <li className="reporte fila-sede" key={sede.id}>
                    <div>
                      <h2>{sede.nombre}</h2>
                      <p>{sede.direccion}</p>
                    </div>
                    {puedeGestionar && (
                      <div className="acciones-reporte">
                        <button className="boton boton-secundario" type="button" aria-label={'Editar ' + sede.nombre}
                          onClick={() => setAccion({ tipo: 'editar', sede })}><Icono nombre="editar" />Editar</button>
                        <button className="boton boton-secundario" type="button" aria-label={'Eliminar ' + sede.nombre}
                          onClick={() => setAccion({ tipo: 'baja', sede })}><Icono nombre="baja" />Eliminar</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {plan === 'EMPRESA' && usuario?.rol === 'JEFATURA' && vista.tipo === 'lista' && <AsignacionSedes sedes={vista.sedes} />}
      {puedeGestionar && accion && (
        <DialogoSede accion={accion} alCerrar={() => setAccion(null)} alGuardar={operacionTerminada} />
      )}
    </>
  )
}

function DialogoSede({ accion, alCerrar, alGuardar }: {
  accion: Accion
  alCerrar: () => void
  alGuardar: (mensaje: string) => void
}) {
  const { solicitar, puedeEscribir, plan } = useAuth()
  const campos = useId()
  const sede = accion.tipo === 'crear' ? null : accion.sede
  const eliminando = accion.tipo === 'baja'
  const [nombre, setNombre] = useState(sede?.nombre ?? '')
  const [direccion, setDireccion] = useState(sede?.direccion ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const enCurso = useRef(false)
  const titulo = eliminando ? 'Eliminar sede' : sede ? 'Editar sede' : 'Nueva sede'

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enCurso.current || !puedeEscribir || plan !== 'EMPRESA') return

    const datos: SedeSolicitud = { nombre: nombre.trim(), direccion: direccion.trim() }
    if (!eliminando && (!datos.nombre || !datos.direccion)) {
      setError('Ingresa el nombre y la dirección de la sede.')
      document.getElementById(campos + (datos.nombre ? '-direccion' : '-nombre'))?.focus()
      return
    }

    enCurso.current = true
    setGuardando(true)
    setError('')
    try {
      if (eliminando && sede) {
        await solicitar<void>(`/sedes/${sede.id}`, { method: 'DELETE' })
        alGuardar('Sede «' + sede.nombre + '» eliminada.')
        return
      }
      const guardada = await solicitar<SedeRespuesta>(sede ? `/sedes/${sede.id}` : '/sedes', {
        method: sede ? 'PUT' : 'POST', body: JSON.stringify(datos),
      })
      alGuardar('Sede «' + guardada.nombre + '» ' + (sede ? 'actualizada.' : 'creada.'))
    } catch (fallo) {
      setError(mensajeError(fallo, eliminando ? 'No se pudo eliminar la sede.' : 'No se pudo guardar la sede.'))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo={titulo} ocupado={guardando} alCerrar={alCerrar}>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form onSubmit={guardar} noValidate aria-busy={guardando}>
        {eliminando ? (
          <p>¿Eliminar la sede <strong>{sede?.nombre}</strong>?</p>
        ) : (
          <fieldset className="campos-orden" disabled={guardando}>
            <legend className="solo-lectores">Datos de la sede</legend>
            <div className="campo">
              <label htmlFor={campos + '-nombre'}>Nombre</label>
              <input id={campos + '-nombre'} required maxLength={120} value={nombre}
                onChange={(evento) => setNombre(evento.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor={campos + '-direccion'}>Dirección</label>
              <textarea id={campos + '-direccion'} required maxLength={250} rows={3} value={direccion}
                onChange={(evento) => setDireccion(evento.target.value)} />
            </div>
          </fieldset>
        )}
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario" disabled={guardando} onClick={alCerrar}>Cancelar</button>
          <button type="submit" className={'boton ' + (eliminando ? 'boton-peligro' : 'boton-primario')} disabled={guardando}>
            <Icono nombre={eliminando ? 'baja' : 'guardar'} />
            {eliminando ? (guardando ? 'Eliminando…' : 'Eliminar sede') : (guardando ? 'Guardando…' : 'Guardar sede')}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
