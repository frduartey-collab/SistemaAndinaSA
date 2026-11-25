import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Icono } from './Icono'

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro'
type Tema = Exclude<PreferenciaTema, 'sistema'>

type ContextoTema = {
  preferencia: PreferenciaTema
  tema: Tema
  cambiarTema: (preferencia: PreferenciaTema) => void
}

const claveTema = 'sigem.tema'
const consultaSistema = '(prefers-color-scheme: dark)'
const Contexto = createContext<ContextoTema | null>(null)

function leerTema(): PreferenciaTema {
  try {
    const guardado = localStorage.getItem(claveTema)
    if (guardado === 'claro' || guardado === 'oscuro') return guardado
  } catch {
    // La preferencia del dispositivo sigue disponible sin almacenamiento local.
  }
  return 'sistema'
}

export function TemaInterfaz({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState(leerTema)
  const [sistemaOscuro, setSistemaOscuro] = useState(() => window.matchMedia(consultaSistema).matches)
  const tema: Tema = preferencia === 'sistema' ? (sistemaOscuro ? 'oscuro' : 'claro') : preferencia

  useEffect(() => {
    const consulta = window.matchMedia(consultaSistema)
    function actualizar() { setSistemaOscuro(consulta.matches) }
    actualizar()
    consulta.addEventListener('change', actualizar)
    return () => consulta.removeEventListener('change', actualizar)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.sigemTema = tema
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'oscuro' ? '#0b1522' : '#f1f5f9')
    document.querySelector('link[rel="icon"]')?.setAttribute('href',
      tema === 'oscuro' ? '/identidad/sigem-oscuro.svg' : '/identidad/sigem.svg')
  }, [tema])

  function cambiarTema(valor: PreferenciaTema) {
    setPreferencia(valor)
    try {
      if (valor === 'sistema') localStorage.removeItem(claveTema)
      else localStorage.setItem(claveTema, valor)
    } catch {
      // El tema elegido se aplica durante esta sesión.
    }
  }

  return <Contexto.Provider value={{ preferencia, tema, cambiarTema }}>{children}</Contexto.Provider>
}

export function useTema() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('Los controles de tema requieren TemaInterfaz.')
  return contexto
}

export function BotonTema() {
  const { tema, cambiarTema } = useTema()
  const oscuro = tema === 'oscuro'
  const etiqueta = oscuro ? 'Activar modo claro' : 'Activar modo oscuro'

  return (
    <button className="boton boton-secundario boton-tema" type="button" aria-label={etiqueta} title={etiqueta}
      onClick={() => cambiarTema(oscuro ? 'claro' : 'oscuro')}>
      <Icono nombre={oscuro ? 'modoClaro' : 'modoOscuro'} />
    </button>
  )
}
