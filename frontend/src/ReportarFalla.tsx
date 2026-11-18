import { Icono } from './Icono'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ActivoRespuesta, CriticidadEquipo, FallaCrearSolicitud, FallaRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { BuscadorEquipo } from './BuscadorEquipo'
import { ListaFallas } from './ListaFallas'
import { criticidades } from './activos'
import { mensajeError } from './api'

type FotoSimulada = { clave: string; nombre: string }

export function ReportarFalla() {
  const { solicitar } = useAuth()
  const [equipo, setEquipo] = useState<ActivoRespuesta | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<CriticidadEquipo | ''>('')
  const [fotos, setFotos] = useState<FotoSimulada[]>([])
  const [avisoFotos, setAvisoFotos] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [guardada, setGuardada] = useState<FallaRespuesta | null>(null)
  const campoDescripcion = useRef<HTMLTextAreaElement>(null)

  function elegirEquipo(seleccion: ActivoRespuesta | null) {
    setEquipo(seleccion)
    setPrioridad('')
    setError('')
    if (seleccion) campoDescripcion.current?.focus()
  }

  function seleccionarFotos(evento: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(evento.currentTarget.files ?? [])
    const aceptadas = archivos.filter((archivo) => archivo.type.startsWith('image/'))
    const nuevas = [...fotos]
    let superaLimite = false

    for (const archivo of aceptadas) {
      const clave = archivo.name + ':' + archivo.size + ':' + archivo.lastModified
      if (nuevas.some((foto) => foto.clave === clave)) continue
      if (nuevas.length >= 3) {
        superaLimite = true
        break
      }
      nuevas.push({ clave, nombre: archivo.name })
    }

    setFotos(nuevas)
    setAvisoFotos(
      superaLimite ? 'Puedes seleccionar hasta 3 fotos.' :
      aceptadas.length < archivos.length ? 'Selecciona archivos de imagen.' : '',
    )
    evento.currentTarget.value = ''
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando) return
    if (!equipo) {
      setError('Busca y selecciona el equipo que presenta la falla.')
      return
    }
    if (!descripcion.trim()) {
      setError('Escribe una descripción del problema.')
      campoDescripcion.current?.focus()
      return
    }

    const datos: FallaCrearSolicitud = { equipo_id: equipo.id, descripcion: descripcion.trim() }
    if (prioridad) datos.prioridad = prioridad

    setError('')
    setGuardando(true)
    try {
      const falla = await solicitar<FallaRespuesta>('/fallas', { method: 'POST', body: JSON.stringify(datos) })
      setGuardada(falla)
      setEquipo(null)
      setDescripcion('')
      setPrioridad('')
      setFotos([])
      setAvisoFotos('')
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo guardar la falla. Conservamos tus datos para que puedas reintentar.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <div className="encabezado-pagina"><h1>Reportar falla</h1></div>
      {guardada && (
        <p className="aviso aviso-exito" role="status">
          Falla #{guardada.id} registrada para {guardada.equipo_codigo} con prioridad {guardada.prioridad}.
        </p>
      )}
      <div className="modulo-fallas">
        <section className="panel formulario-falla" aria-labelledby="titulo-formulario-falla">
          <h2 id="titulo-formulario-falla">Datos de la falla</h2>
          {error && <p className="aviso aviso-error" role="alert">{error}</p>}
          <form noValidate aria-busy={guardando} onSubmit={guardar}>
            <fieldset className="campos-falla" disabled={guardando}>
              <legend className="solo-lectores">Equipo, problema y prioridad</legend>
              <BuscadorEquipo key={guardada?.id ?? 0} equipo={equipo} alElegir={elegirEquipo} />
              <div className="campo">
                <label htmlFor="falla-descripcion">Descripción del problema</label>
                <textarea id="falla-descripcion" ref={campoDescripcion} rows={4} maxLength={2000}
                  required value={descripcion} aria-describedby="falla-descripcion-ayuda"
                  onChange={(evento) => { setDescripcion(evento.target.value); setError('') }} />
                <p className="ayuda" id="falla-descripcion-ayuda">{descripcion.length} de 2.000 caracteres</p>
              </div>
              <div className="campo">
                <label htmlFor="falla-prioridad">Prioridad</label>
                <select id="falla-prioridad" disabled={!equipo} value={prioridad}
                  onChange={(evento) => setPrioridad(evento.target.value as CriticidadEquipo | '')}>
                  <option value="">{equipo ? 'Sugerida · ' + equipo.criticidad : 'Selecciona un equipo'}</option>
                  {criticidades.map((valor) => <option key={valor}>{valor}</option>)}
                </select>
                {equipo && <p className="ayuda">La sugerencia se basa en la criticidad del equipo. Puedes cambiarla.</p>}
              </div>
              <div className="campo fotos-falla">
                <label htmlFor="falla-fotos" className="etiqueta-con-icono"><Icono nombre="foto" />Fotografías ({fotos.length}/3)</label>
                <p className="ayuda" id="falla-fotos-ayuda">Selección de prueba. Las imágenes no se envían ni se guardan.</p>
                <input id="falla-fotos" type="file" multiple accept="image/*" onChange={seleccionarFotos}
                  aria-describedby="falla-fotos-ayuda" disabled={fotos.length >= 3} />
                {avisoFotos && <p className="ayuda" role="status">{avisoFotos}</p>}
                {fotos.length > 0 && (
                  <ul className="lista-fotos">
                    {fotos.map((foto) => (
                      <li key={foto.clave}>
                        <span>{foto.nombre}</span>
                        <button type="button" className="boton-texto" aria-label={'Quitar ' + foto.nombre}
                          onClick={() => {
                            setFotos((actuales) => actuales.filter((actual) => actual.clave !== foto.clave))
                            setAvisoFotos('')
                          }}><Icono nombre="cerrar" />Quitar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>
            <div className="acciones-falla">
              <button className="boton boton-primario" type="submit" disabled={guardando}>
                <Icono nombre="guardar" />
                {guardando ? 'Guardando…' : 'Guardar falla'}
              </button>
              <p className="solo-lectores" role="status">{guardando ? 'Guardando falla…' : ''}</p>
            </div>
          </form>
        </section>
        <ListaFallas key={guardada?.id ?? 0} />
      </div>
    </>
  )
}
