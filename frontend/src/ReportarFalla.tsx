import { Icono } from './Icono'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ActivoRespuesta, CriticidadEquipo, FallaCrearSolicitud, FallaRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { BuscadorEquipo } from './BuscadorEquipo'
import { ListaFallas } from './ListaFallas'
import { criticidades } from './activos'
import { mensajeError } from './api'
import { esFotoCompatible, MAX_BYTES_FOTO, MAX_FOTOS_FALLA, nombreFoto, prepararFoto, TIPOS_FOTO, type FotoSeleccionada } from './fotosFalla'

export function ReportarFalla() {
  const { solicitar } = useAuth()
  const [equipo, setEquipo] = useState<ActivoRespuesta | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<CriticidadEquipo | ''>('')
  const [fotos, setFotos] = useState<FotoSeleccionada[]>([])
  const [avisoFotos, setAvisoFotos] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [guardada, setGuardada] = useState<FallaRespuesta | null>(null)
  const campoDescripcion = useRef<HTMLTextAreaElement>(null)
  const campoFotos = useRef<HTMLInputElement>(null)
  const enviando = useRef(false)

  function elegirEquipo(seleccion: ActivoRespuesta | null) {
    setEquipo(seleccion)
    setPrioridad('')
    setError('')
    if (seleccion) campoDescripcion.current?.focus()
  }

  function seleccionarFotos(evento: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(evento.currentTarget.files ?? [])
    const nuevas = [...fotos]
    const avisos = new Set<string>()

    for (const archivo of archivos) {
      if (!esFotoCompatible(archivo.type)) {
        avisos.add('Selecciona imágenes JPEG, PNG o WebP.')
        continue
      }
      if (archivo.size > MAX_BYTES_FOTO || archivo.size === 0) {
        avisos.add('Cada fotografía debe contener datos y pesar hasta 5 MiB.')
        continue
      }
      const clave = archivo.name + ':' + archivo.size + ':' + archivo.lastModified
      if (nuevas.some((foto) => foto.clave === clave)) continue
      if (nuevas.length >= MAX_FOTOS_FALLA) {
        avisos.add('Puedes adjuntar hasta 3 fotografías.')
        continue
      }
      nuevas.push({ clave, archivo, tipo: archivo.type, nombre: nombreFoto(archivo.name) })
    }

    setFotos(nuevas)
    setAvisoFotos([...avisos].join(' '))
    evento.currentTarget.value = ''
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando.current) return
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
    enviando.current = true
    setGuardando(true)
    try {
      try {
        if (fotos.length) datos.fotos = await Promise.all(fotos.map(prepararFoto))
      } catch (fallo) {
        setAvisoFotos(fallo instanceof Error ? fallo.message : 'No se pudieron leer las fotografías.')
        return
      }
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
      enviando.current = false
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
                <label htmlFor="falla-fotos" className="etiqueta-con-icono"><Icono nombre="foto" />Fotografías ({fotos.length}/{MAX_FOTOS_FALLA})</label>
                <p className="ayuda" id="falla-fotos-ayuda">Opcional. Adjunta hasta 3 imágenes JPEG, PNG o WebP de hasta 5 MiB cada una.</p>
                <input id="falla-fotos" ref={campoFotos} type="file" multiple accept={TIPOS_FOTO.join(',')} onChange={seleccionarFotos}
                  aria-describedby="falla-fotos-ayuda" disabled={fotos.length >= MAX_FOTOS_FALLA} />
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
                            requestAnimationFrame(() => campoFotos.current?.focus())
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
