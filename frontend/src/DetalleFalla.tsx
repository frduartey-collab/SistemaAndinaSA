import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import type { FallaDetalleRespuesta, FotoFallaResumen } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { mostrarFecha } from './activos'
import { mensajeError } from './api'

type Carga<T> =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; datos: T }

export function DetalleFalla() {
  const { id = '' } = useParams()
  const { state } = useLocation()
  const desdeAvisos = (state as { desdeAvisos?: boolean } | null)?.desdeAvisos === true
  const numero = Number(id)
  const idValido = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(numero)

  return (
    <>
      <div className="encabezado-pagina">
        <h1>{idValido ? 'Falla #' + numero : 'Detalle de falla'}</h1>
        <Link className="boton boton-secundario" to={desdeAvisos ? '/avisos' : '/fallas'}>
          <Icono nombre="anterior" />{desdeAvisos ? 'Volver a avisos' : 'Volver a fallas'}
        </Link>
      </div>
      {idValido ? (
        <FallaPorId key={numero} id={numero} />
      ) : (
        <p className="aviso aviso-error" role="alert">El identificador de la falla no es válido.</p>
      )}
    </>
  )
}

function FallaPorId({ id }: { id: number }) {
  const { solicitar } = useAuth()
  const [vista, setVista] = useState<Carga<FallaDetalleRespuesta>>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    solicitar<FallaDetalleRespuesta>(`/fallas/${id}`, { signal })
      .then((falla) => {
        if (!signal.aborted) setVista({ tipo: 'lista', datos: falla })
      })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setVista({
          tipo: 'error', mensaje: mensajeError(fallo, 'No se pudo cargar la falla.'),
        })
      })
    return () => controlador.abort()
  }, [id, intento, solicitar])

  if (vista.tipo === 'cargando') return <p className="aviso" role="status">Cargando falla…</p>
  if (vista.tipo === 'error') {
    return (
      <div className="aviso aviso-error">
        <p role="alert">{vista.mensaje}</p>
        <button className="boton boton-secundario" type="button" onClick={() => {
          setVista({ tipo: 'cargando' })
          setIntento((anterior) => anterior + 1)
        }}><Icono nombre="sincronizar" />Reintentar</button>
      </div>
    )
  }
  const { datos: falla } = vista

  return (
    <section className="panel detalle-falla">
      <div className="reporte-cabecera">
        <h2>{falla.equipo_codigo} · {falla.equipo_nombre}</h2>
        <span className={'insignia criticidad-' + falla.prioridad.toLowerCase()}>Prioridad {falla.prioridad}</span>
      </div>
      <p className="ayuda">
        Reportada por {falla.usuario_nombre} · <time dateTime={falla.fecha_reporte}>{mostrarFecha(falla.fecha_reporte)}</time>
      </p>
      <p className="descripcion-falla">{falla.descripcion}</p>
      <section className="adjuntos-falla" aria-labelledby="falla-fotografias">
        <h3 id="falla-fotografias">Fotografías</h3>
        {falla.fotos.length === 0 ? <p className="ayuda">Este reporte no tiene fotografías.</p> : (
          <ul className="galeria-falla">
            {falla.fotos.map((foto) => (
              <li key={foto.id}><FotoAdjunta fallaId={falla.id} foto={foto} /></li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function FotoAdjunta({ fallaId, foto }: { fallaId: number; foto: FotoFallaResumen }) {
  const { solicitar } = useAuth()
  const [vista, setVista] = useState<Carga<string>>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    let urlFoto: string | undefined

    solicitar<Blob>(`/fallas/${fallaId}/fotos/${foto.id}`, { formato: 'foto', signal })
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
  }, [fallaId, foto.id, intento, solicitar])

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
