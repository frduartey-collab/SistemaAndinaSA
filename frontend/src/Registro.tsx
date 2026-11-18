import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { RegistroSolicitud, Rol, UsuarioSesion } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { etiquetasRol } from './activos'
import { ErrorApi, llamarApi, mensajeError } from './api'
import { normalizarRut, rutValido } from './rut'

const ROLES_PUBLICOS = ['TECNICO', 'TRABAJADOR'] as const

function rolesDisponibles(rol?: Rol): readonly Rol[] {
  if (rol === 'JEFATURA') return [...ROLES_PUBLICOS, 'BODEGA', 'SUPERVISOR', 'JEFATURA']
  if (rol === 'SUPERVISOR') return [...ROLES_PUBLICOS, 'BODEGA']
  return ROLES_PUBLICOS
}

export function Registro() {
  const { estado, solicitar } = useAuth()
  const navigate = useNavigate()
  const sesionActiva = estado.tipo === 'activa'
  const roles = rolesDisponibles(sesionActiva ? estado.usuario.rol : undefined)
  const [rut, setRut] = useState('')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol | ''>('')
  const [visible, setVisible] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setExito('')

    const rutNormalizado = normalizarRut(rut)
    if (!/^[1-9][0-9]{6,7}-[0-9K]$/.test(rutNormalizado)) {
      setError('Ingresa un RUT con dígito verificador y sin ceros al comienzo.')
      return
    }
    if (!rutValido(rutNormalizado)) {
      setError('El dígito verificador del RUT no coincide. Revisa el número.')
      return
    }
    if (!nombre.trim()) {
      setError('Ingresa el nombre de la persona.')
      return
    }
    if (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 72) {
      setError('La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes.')
      return
    }
    if (!rol || !roles.includes(rol)) {
      setError('Selecciona un rol disponible.')
      return
    }

    const datos: RegistroSolicitud = { rut: rutNormalizado, nombre: nombre.trim(), password, rol }
    const opciones = { method: 'POST', body: JSON.stringify(datos) }
    setError('')
    setEnviando(true)

    try {
      const cuenta = sesionActiva
        ? await solicitar<UsuarioSesion>('/auth/register', opciones)
        : await llamarApi<UsuarioSesion>('/auth/register', opciones)

      if (!sesionActiva) {
        navigate('/login', { replace: true, state: { rutRegistrado: cuenta.rut } })
        return
      }
      setExito('Cuenta de ' + cuenta.nombre + ' creada. Ya puede ingresar con su RUT.')
      setRut('')
      setNombre('')
      setPassword('')
      setRol('')
      setVisible(false)
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.estado === 429 && fallo.reintentarEn) {
        setError('Espera ' + fallo.reintentarEn + ' segundos antes de volver a intentarlo.')
      } else {
        setError(mensajeError(fallo, 'No se pudo crear la cuenta. Tus datos siguen en el formulario.'))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pantalla-login">
      <div className="presentacion">
        <p className="identidad"><span className="marca" aria-hidden="true">A</span> Manufacturas Andina</p>
        <p className="titulo-presentacion">Gestión de mantenimiento</p>
      </div>
      <section className="panel-login" aria-labelledby="titulo-registro">
        <h1 id="titulo-registro">Crear cuenta</h1>
        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {exito && <p className="aviso aviso-exito" role="status">{exito}</p>}
        <form className="formulario-login" noValidate aria-busy={enviando} onSubmit={registrar}>
          <fieldset disabled={enviando} className="formulario-login">
            <legend className="solo-lectores">Datos de la cuenta</legend>
            <div className="campo">
              <label htmlFor="registro-rut">RUT</label>
              <input id="registro-rut" autoComplete={sesionActiva ? 'off' : 'username'} autoCapitalize="characters"
                required maxLength={16} value={rut} onChange={(evento) => setRut(evento.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="registro-nombre">Nombre completo</label>
              <input id="registro-nombre" autoComplete={sesionActiva ? 'off' : 'name'} required
                maxLength={120} value={nombre} onChange={(evento) => setNombre(evento.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="registro-password">Contraseña</label>
              <div className="entrada-password">
                <input id="registro-password" type={visible ? 'text' : 'password'} autoComplete="new-password"
                  required minLength={8} maxLength={72} aria-describedby="registro-password-ayuda"
                  value={password} onChange={(evento) => setPassword(evento.target.value)} />
                <button className="boton boton-secundario" type="button" aria-controls="registro-password"
                  onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button>
              </div>
              <p className="ayuda" id="registro-password-ayuda">Usa al menos 8 caracteres.</p>
            </div>
            <div className="campo">
              <label htmlFor="registro-rol">Rol</label>
              <select id="registro-rol" required value={rol}
                onChange={(evento) => setRol(evento.target.value as Rol | '')}>
                <option value="">Seleccionar</option>
                {roles.map((valor) => <option key={valor} value={valor}>{etiquetasRol[valor]}</option>)}
              </select>
            </div>
          </fieldset>
          <button className="boton boton-primario" type="submit" disabled={enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>
        <p className="enlace-cuenta">
          <Link to={sesionActiva ? '/equipos' : '/login'}>
            {sesionActiva ? 'Volver a equipos' : 'Volver a iniciar sesión'}
          </Link>
        </p>
        <p className="solo-lectores" role="status">{enviando ? 'Creando cuenta…' : ''}</p>
      </section>
    </main>
  )
}
