import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { SedeRespuesta, UsuarioSede, UsuarioSedeSolicitud } from '../../backend/src/dominio'
import { etiquetasRol } from './activos'
import { mensajeError } from './api'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'

export function AsignacionSedes({ sedes }: { sedes: SedeRespuesta[] }) {
  const { solicitar } = useAuth()
  const titulo = useId()
  const [usuarios, setUsuarios] = useState<UsuarioSede[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [usuario, setUsuario] = useState<UsuarioSede | null>(null)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<UsuarioSede[]>('/usuarios', { signal })
      .then((lista) => { if (!signal.aborted) setUsuarios(lista) })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setError(mensajeError(fallo, 'No se pudieron cargar los usuarios.'))
      })
    return () => controlador.abort()
  }, [revision, solicitar])

  function actualizado(datos: UsuarioSede) {
    setUsuarios((lista) => lista?.map((item) => item.id === datos.id ? datos : item) ?? null)
    setUsuario(null)
    setAviso('Asignación de ' + datos.nombre + ' guardada.')
  }

  return (
    <section className="panel reportes resultados" aria-labelledby={titulo}>
      <h2 id={titulo}>Asignación de usuarios a sedes</h2>
      <p className={aviso ? 'aviso aviso-exito' : 'solo-lectores'} role="status">{aviso}</p>
      {!usuarios && !error && <p className="aviso" role="status">Cargando usuarios…</p>}
      {error && (
        <div className="aviso aviso-error">
          <p role="alert">{error}</p>
          <button className="boton boton-secundario" type="button" onClick={() => {
            setError(''); setRevision((anterior) => anterior + 1)
          }}><Icono nombre="sincronizar" />Reintentar usuarios</button>
        </div>
      )}
      {usuarios && (usuarios.length === 0 ? <p>Aún no hay cuentas para asignar.</p> : (
        <ul className="lista-reportes">
          {usuarios.map((item) => (
            <li className="reporte fila-sede" key={item.id}>
              <div>
                <h3>{item.nombre}</h3>
                <p className="ayuda">{etiquetasRol[item.rol]} · {item.rol === 'JEFATURA' ? 'Acceso a todas las sedes'
                  : item.sede_id === null ? 'Sin sede asignada' : sedes.find(({ id }) => id === item.sede_id)?.nombre ?? 'Sede #' + item.sede_id}</p>
              </div>
              {item.rol !== 'JEFATURA' && (
                <button className="boton boton-secundario" type="button" aria-label={'Asignar sede a ' + item.nombre}
                  onClick={() => { setAviso(''); setUsuario(item) }}><Icono nombre="sede" />Asignar sede</button>
              )}
            </li>
          ))}
        </ul>
      ))}
      {usuario && <DialogoAsignacion usuario={usuario} sedes={sedes} alCerrar={() => setUsuario(null)} alGuardar={actualizado} />}
    </section>
  )
}

function DialogoAsignacion({ usuario, sedes, alCerrar, alGuardar }: {
  usuario: UsuarioSede; sedes: SedeRespuesta[]; alCerrar: () => void; alGuardar: (usuario: UsuarioSede) => void
}) {
  const { solicitar } = useAuth()
  const campo = useId()
  const [valor, setValor] = useState(String(usuario.sede_id ?? ''))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const enCurso = useRef(false)
  const cambio = valor !== String(usuario.sede_id ?? '')

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enCurso.current || !cambio || usuario.rol === 'JEFATURA') return
    const datos: UsuarioSedeSolicitud = { sede_id: valor ? Number(valor) : null }
    enCurso.current = true
    setGuardando(true)
    setError('')
    try {
      const guardado = await solicitar<UsuarioSede>(`/usuarios/${usuario.id}/sede`, {
        method: 'PATCH', body: JSON.stringify(datos),
      })
      alGuardar(guardado)
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo guardar la asignación.'))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo="Asignar sede" ocupado={guardando} alCerrar={alCerrar}>
      <p>{usuario.nombre} · {etiquetasRol[usuario.rol]}</p>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      <form className="formulario-intervencion" aria-busy={guardando} onSubmit={guardar}>
        <div className="campo">
          <label htmlFor={campo}>Sede asignada</label>
          <select id={campo} value={valor} disabled={guardando} onChange={(evento) => setValor(evento.target.value)}>
            <option value="">Sin sede asignada</option>
            {usuario.sede_id !== null && !sedes.some(({ id }) => id === usuario.sede_id) &&
              <option value={usuario.sede_id}>Sede #{usuario.sede_id}</option>}
            {sedes.map(({ id, nombre }) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
        <div className="dialogo-acciones">
          <button type="button" className="boton boton-secundario" disabled={guardando} onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton-primario" disabled={!cambio || guardando}>
            <Icono nombre="guardar" />{guardando ? 'Guardando…' : 'Guardar asignación'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
