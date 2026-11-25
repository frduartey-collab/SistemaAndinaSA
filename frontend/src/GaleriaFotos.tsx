import { useEffect, useId, useState } from 'react'
import type { FotoFallaResumen } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { mensajeError } from './api'

type Recurso = 'fallas' | 'ordenes'
type CargaFoto =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; datos: string }

type Props = {
  recurso: Recurso
  id: number
  fotos: FotoFallaResumen[]
  titulo: string
}

export function GaleriaFotos({ recurso, id, fotos, titulo }: Props) {
  const tituloId = useId()

  return (
    <section className="adjuntos-falla" aria-labelledby={tituloId}>
      <h3 id={tituloId}>{titulo}</h3>
      {fotos.length === 0 ? <p className="ayuda">Este reporte no tiene fotografías.</p> : (
        <ul className="galeria-falla">
          {fotos.map((foto) => (
            <li key={foto.id}><FotoAdjunta recurso={recurso} id={id} foto={foto} /></li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FotoAdjunta({ recurso, id, foto }: { recurso: Recurso; id: number; foto: FotoFallaResumen }) {
  const { solicitar } = useAuth()
  const [vista, setVista] = useState<CargaFoto>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    let urlFoto: string | undefined

    solicitar<Blob>(`/${recurso}/${id}/fotos/${foto.id}`, { formato: 'foto', signal })
      .then((archivo) => {
        if (signal.aborted) return
        urlFoto = URL.createObjectURL(archivo)
        setVista({ tipo: 'lista', datos: urlFoto })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudo cargar esta fotografía.'),
        })
      })

    return () => {
      controlador.abort()
      if (urlFoto) URL.revokeObjectURL(urlFoto)
    }
  }, [recurso, id, foto.id, intento, solicitar])

  return (
    <figure className="foto-falla">
      {vista.tipo === 'lista' && (
        <img src={vista.datos} alt={'Fotografía adjunta: ' + foto.nombre} decoding="async"
          onError={() => setVista({ tipo: 'error', mensaje: 'El archivo no se pudo mostrar como imagen.' })} />
      )}
      {vista.tipo === 'cargando' && <p className="ayuda" role="status">Cargando fotografía…</p>}
      {vista.tipo === 'error' && (
        <div className="aviso aviso-error">
          <p role="alert">{vista.mensaje}</p>
          <button className="boton boton-secundario" type="button" aria-label={'Reintentar ' + foto.nombre}
            onClick={() => {
              setVista({ tipo: 'cargando' })
              setIntento((anterior) => anterior + 1)
            }}><Icono nombre="sincronizar" />Reintentar</button>
        </div>
      )}
      <figcaption>{foto.nombre}</figcaption>
    </figure>
  )
}
