import { useState, type FormEvent } from 'react'
import type { ActivoActualizarSolicitud, ActivoCrearSolicitud, ActivoRespuesta, CriticidadEquipo } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { criticidades, etiquetasEstado } from './activos'
import { ErrorApi, mensajeError } from './api'

type Campos = {
  codigo: string
  nombre: string
  marca: string
  modelo: string
  ubicacion: string
  criticidad: CriticidadEquipo | ''
  horas: string
}

export type BorradorEquipo = {
  equipo?: ActivoRespuesta
  campos: Campos
}

type Errores = Partial<Record<keyof Campos, string>>

type PropsFormulario = {
  equipo?: ActivoRespuesta
  borrador?: BorradorEquipo
  alConservar: (borrador: BorradorEquipo) => void
  alCerrar: () => void
  alGuardar: (mensaje: string) => void
}

export function FormularioEquipo({ equipo, borrador, alConservar, alCerrar, alGuardar }: PropsFormulario) {
  const { solicitar, puedeEscribir } = useAuth()
  const [campos, setCampos] = useState<Campos>(() => borrador?.campos ?? ({
    codigo: equipo?.codigo ?? '',
    nombre: equipo?.nombre ?? '',
    marca: equipo?.marca ?? '',
    modelo: equipo?.modelo ?? '',
    ubicacion: equipo?.ubicacion ?? '',
    criticidad: equipo?.criticidad ?? '',
    horas: String(equipo?.uso_acumulado_horas ?? 0),
  }))
  const [errores, setErrores] = useState<Errores>({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  function cambiar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    const siguientes = { ...campos, [campo]: valor }
    setCampos(siguientes)
    alConservar({ equipo, campos: siguientes })
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }))
    setError('')
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando || !puedeEscribir) return
    const formulario = evento.currentTarget
    const { criticidad } = campos
    const codigo = campos.codigo.trim().toUpperCase()
    const nombre = campos.nombre.trim()
    const ubicacion = campos.ubicacion.trim()
    const marca = campos.marca.trim() || null
    const modelo = campos.modelo.trim() || null
    const horas = Number(campos.horas)
    const encontrados: Errores = {}

    if (!equipo && !/^EQ-[0-9]{4}$/.test(codigo)) encontrados.codigo = 'Usa EQ- seguido de cuatro números, por ejemplo, EQ-0042.'
    if (!nombre) encontrados.nombre = 'Ingresa el nombre del equipo.'
    if (!ubicacion) encontrados.ubicacion = 'Ingresa la ubicación.'
    if (!criticidad) encontrados.criticidad = 'Selecciona una criticidad.'
    if (equipo && (!campos.horas.trim() || !Number.isFinite(horas) || horas < 0)) {
      encontrados.horas = 'Ingresa un número de horas mayor o igual a cero.'
    }

    setErrores(encontrados)
    setError('')
    const primerError = Object.keys(encontrados)[0]
    if (primerError || !criticidad) {
      const campo = formulario.elements.namedItem(primerError)
      if (campo instanceof HTMLElement) campo.focus()
      return
    }

    setGuardando(true)
    let mensaje = ''
    try {
      if (equipo) {
        const cambios: ActivoActualizarSolicitud = {}
        if (nombre !== equipo.nombre) cambios.nombre = nombre
        if (ubicacion !== equipo.ubicacion) cambios.ubicacion = ubicacion
        if (criticidad !== equipo.criticidad) cambios.criticidad = criticidad
        if (marca !== (equipo.marca?.trim() || null)) cambios.marca = marca
        if (modelo !== (equipo.modelo?.trim() || null)) cambios.modelo = modelo
        if (horas !== equipo.uso_acumulado_horas) cambios.uso_acumulado_horas = horas

        if (Object.keys(cambios).length > 0) {
          await solicitar<ActivoRespuesta>(`/activos/${equipo.id}`, {
            method: 'PATCH',
            body: JSON.stringify(cambios),
          })
          mensaje = 'Equipo ' + equipo.codigo + ' actualizado.'
        } else {
          mensaje = 'No hay cambios para guardar en ' + equipo.codigo + '.'
        }
      } else {
        const datos: ActivoCrearSolicitud = {
          codigo: codigo as ActivoCrearSolicitud['codigo'],
          nombre, marca, modelo, ubicacion, criticidad,
        }
        const creado = await solicitar<ActivoRespuesta>('/activos', { method: 'POST', body: JSON.stringify(datos) })
        mensaje = 'Equipo ' + creado.codigo + ' creado.'
      }
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.codigo === 'CODIGO_DUPLICADO') {
        setErrores({ codigo: 'Este código ya está reservado, incluso si el equipo fue dado de baja.' })
      } else if (fallo instanceof ErrorApi && fallo.codigo === 'CODIGO_FORMATO_INVALIDO') {
        setErrores({ codigo: fallo.message })
      } else {
        setError(mensajeError(fallo, 'No se pudo guardar el equipo. Tus datos siguen en el formulario.'))
      }
    } finally {
      setGuardando(false)
    }
    if (mensaje) alGuardar(mensaje)
  }

  function errorCampo(campo: keyof Campos) {
    return errores[campo] && <p id={'error-' + campo} className="error-campo" role="alert">{errores[campo]}</p>
  }

  function atributosError(campo: keyof Campos) {
    return {
      'aria-invalid': Boolean(errores[campo]),
      'aria-describedby': errores[campo] ? 'error-' + campo : undefined,
    }
  }

  return (
    <Dialogo titulo={equipo ? 'Editar equipo' : 'Nuevo equipo'} amplio ocupado={guardando} alCerrar={alCerrar}>
      <form noValidate onSubmit={guardar} aria-busy={guardando}>
        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        <fieldset disabled={guardando}>
          <legend className="solo-lectores">Datos del equipo</legend>
          <p className="ayuda">Los campos con * son obligatorios.</p>
          <div className="campos-equipo">
            <div className="campo">
              <label htmlFor="equipo-codigo">Código *</label>
              <input id="equipo-codigo" name="codigo" readOnly={Boolean(equipo)} required
                value={campos.codigo} maxLength={7} spellCheck={false} autoCapitalize="characters"
                onChange={(evento) => cambiar('codigo', evento.target.value)}
                {...atributosError('codigo')}
                aria-describedby={errores.codigo ? 'error-codigo' : 'ayuda-codigo'} />
              {errores.codigo ? errorCampo('codigo') :
                <p id="ayuda-codigo" className="ayuda">{equipo ? 'El código se conserva al editar.' : 'Formato EQ-0000.'}</p>}
            </div>
            <div className="campo">
              <label htmlFor="equipo-nombre">Nombre *</label>
              <input id="equipo-nombre" name="nombre" required maxLength={120} value={campos.nombre}
                onChange={(evento) => cambiar('nombre', evento.target.value)} {...atributosError('nombre')} />
              {errorCampo('nombre')}
            </div>
            <div className="campo">
              <label htmlFor="equipo-marca">Marca</label>
              <input id="equipo-marca" name="marca" maxLength={120} value={campos.marca}
                onChange={(evento) => cambiar('marca', evento.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="equipo-modelo">Modelo</label>
              <input id="equipo-modelo" name="modelo" maxLength={120} value={campos.modelo}
                onChange={(evento) => cambiar('modelo', evento.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="equipo-ubicacion">Ubicación *</label>
              <input id="equipo-ubicacion" name="ubicacion" required maxLength={120} value={campos.ubicacion}
                onChange={(evento) => cambiar('ubicacion', evento.target.value)} {...atributosError('ubicacion')} />
              {errorCampo('ubicacion')}
            </div>
            <div className="campo">
              <label htmlFor="equipo-criticidad">Criticidad *</label>
              <select id="equipo-criticidad" name="criticidad" required value={campos.criticidad}
                onChange={(evento) => cambiar('criticidad', evento.target.value as Campos['criticidad'])}
                {...atributosError('criticidad')}>
                <option value="">Seleccionar</option>
                {criticidades.map((valor) => <option key={valor}>{valor}</option>)}
              </select>
              {errorCampo('criticidad')}
            </div>
            <div className="campo">
              <label htmlFor="equipo-horas">Horas acumuladas</label>
              <input id="equipo-horas" name="horas" type="number" min={0} step="any" readOnly={!equipo}
                value={campos.horas} onChange={(evento) => cambiar('horas', evento.target.value)}
                {...atributosError('horas')} />
              {errorCampo('horas')}
            </div>
            <div className="campo">
              <label htmlFor="equipo-estado">Estado</label>
              <input id="equipo-estado" readOnly value={etiquetasEstado[equipo?.estado ?? 'OPERATIVO']} />
            </div>
          </div>
        </fieldset>
        <div className="dialogo-acciones">
          <button className="boton boton-secundario" type="button" disabled={guardando} onClick={alCerrar}>Cancelar</button>
          <button className="boton boton-primario" type="submit" disabled={guardando || !puedeEscribir}>
            {guardando ? 'Guardando…' : 'Guardar equipo'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}

