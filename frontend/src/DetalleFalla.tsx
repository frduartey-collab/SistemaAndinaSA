import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import type { FallaDetalleRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { GaleriaFotos } from './GaleriaFotos'
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
      <GaleriaFotos recurso="fallas" id={falla.id} fotos={falla.fotos} titulo="Fotografías" />
    </section>
  )
}
