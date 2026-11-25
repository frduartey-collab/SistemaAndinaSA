import { useEffect, useState, type FormEvent } from 'react'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { useTema, type PreferenciaTema } from './TemaInterfaz'

type Preferencias = {
  densidad: 'comoda' | 'compacta'
  texto: 'normal' | 'grande'
}

const clave = 'sigem.preferencias-interfaz'
const predeterminadas: Preferencias = { densidad: 'comoda', texto: 'normal' }

function leerPreferencias(): Preferencias {
  try {
    const guardadas = localStorage.getItem(clave)
    const datos = guardadas ? JSON.parse(guardadas) as Partial<Preferencias> | null : null
    return {
      densidad: datos?.densidad === 'compacta' ? 'compacta' : 'comoda',
      texto: datos?.texto === 'grande' ? 'grande' : 'normal',
    }
  } catch {
    return predeterminadas
  }
}

export function AjustesInterfaz() {
  const [preferencias, setPreferencias] = useState(leerPreferencias)
  const { preferencia: temaPreferido, cambiarTema } = useTema()
  const [borrador, setBorrador] = useState<(Preferencias & { tema: PreferenciaTema }) | null>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.sigemDensidad = preferencias.densidad
    raiz.dataset.sigemTexto = preferencias.texto

    return () => {
      delete raiz.dataset.sigemDensidad
      delete raiz.dataset.sigemTexto
    }
  }, [preferencias])

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!borrador) return

    const { tema, ...ajustes } = borrador
    cambiarTema(tema)
    setPreferencias(ajustes)
    setBorrador(null)

    try {
      localStorage.setItem(clave, JSON.stringify(ajustes))
      setAviso('Ajustes guardados.')
    } catch {
      setAviso('Ajustes aplicados durante esta sesión.')
    }
  }

  return (
    <>
      <button
        className="boton boton-secundario boton-ajustes"
        type="button"
        aria-label="Ajustes de interfaz"
        title="Ajustes de interfaz"
        onClick={() => { setAviso(''); setBorrador({ ...preferencias, tema: temaPreferido }) }}
      >
        <Icono nombre="ajustes" />
      </button>
      <span className="solo-lectores" role="status">{aviso}</span>
      {borrador && (
        <Dialogo titulo="Ajustes de interfaz" alCerrar={() => setBorrador(null)}>
          <form className="ajustes-formulario" onSubmit={guardar}>
            <div className="campo">
              <label htmlFor="sigem-tema">Apariencia</label>
              <select id="sigem-tema" value={borrador.tema} onChange={(evento) => {
                const valor = evento.target.value
                const tema = valor === 'claro' || valor === 'oscuro' ? valor : 'sistema'
                setBorrador({ ...borrador, tema })
              }}>
                <option value="sistema">Usar tema del dispositivo</option>
                <option value="claro">Claro</option>
                <option value="oscuro">Oscuro</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="sigem-densidad">Densidad del catálogo</label>
              <select id="sigem-densidad" value={borrador.densidad} onChange={(evento) => {
                const densidad = evento.target.value === 'compacta' ? 'compacta' : 'comoda'
                setBorrador({ ...borrador, densidad })
              }}>
                <option value="comoda">Cómoda</option>
                <option value="compacta">Compacta</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="sigem-texto">Tamaño del texto</label>
              <select id="sigem-texto" value={borrador.texto} onChange={(evento) => {
                const texto = evento.target.value === 'grande' ? 'grande' : 'normal'
                setBorrador({ ...borrador, texto })
              }}>
                <option value="normal">Normal</option>
                <option value="grande">Grande</option>
              </select>
            </div>
            <div className="dialogo-acciones">
              <button className="boton boton-secundario" type="button" onClick={() => setBorrador(null)}>
                Cancelar
              </button>
              <button className="boton boton-primario" type="submit">
                <Icono nombre="guardar" />
                Guardar ajustes
              </button>
            </div>
          </form>
        </Dialogo>
      )}
    </>
  )
}
