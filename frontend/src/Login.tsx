import { Icono } from './Icono'
import { MarcaSigem } from './MarcaSigem'
import { BotonTema } from './TemaInterfaz'
import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from './AuthContext'
import { ErrorApi, mensajeError } from './api'
import { PLANES, leerPlan, rutaConPlan } from './planes'

import { normalizarRut } from './rut'

export function Login() {
  const { estado, iniciarSesion } = useAuth()
  const { state, search } = useLocation()
  const plan = leerPlan(new URLSearchParams(search))
  const rutRegistrado = typeof state?.rutRegistrado === 'string' ? state.rutRegistrado : ''
  const [rut, setRut] = useState(rutRegistrado)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorRut, setErrorRut] = useState('')
  const [errorPassword, setErrorPassword] = useState('')
  const [error, setError] = useState('')
  const campoRut = useRef<HTMLInputElement>(null)
  const campoPassword = useRef<HTMLInputElement>(null)

  if (estado.tipo === 'activa') {
    return <Navigate to={plan && estado.usuario.rol === 'JEFATURA' ? rutaConPlan('/suscripcion', plan) : '/inicio'} replace />
  }

  async function ingresar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return

    const rutNormalizado = normalizarRut(rut)
    const rutInvalido = !/^[0-9]{7,8}-[0-9K]$/.test(rutNormalizado)
    setErrorRut(rutInvalido ? 'Ingresa tu RUT con dígito verificador, por ejemplo, 11111111-1.' : '')
    setErrorPassword(password ? '' : 'Ingresa tu contraseña.')
    setError('')

    if (rutInvalido || !password) {
      const campoInvalido = rutInvalido ? campoRut : campoPassword
      campoInvalido.current?.focus()
      return
    }

    setEnviando(true)
    try {
      await iniciarSesion({ rut: rutNormalizado, password })
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.codigo === 'RUT_INVALIDO') {
        setErrorRut(fallo.message)
        campoRut.current?.focus()
      } else if (fallo instanceof ErrorApi && fallo.codigo === 'DEMASIADOS_INTENTOS') {
        const segundos = fallo.reintentarEn
        setError(segundos
          ? 'Demasiados intentos. Vuelve a intentarlo en ' + segundos + ' segundos.'
          : 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.')
      } else {
        setError(mensajeError(fallo, 'No se pudo iniciar sesión. Inténtalo de nuevo.'))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pantalla-login">
      <div className="presentacion">
        <div className="acciones-tema-publica">
          <MarcaSigem />
          <BotonTema />
        </div>
        <p className="titulo-presentacion">Sistema Gestor de Mantenimiento</p>
      </div>
      <section className="panel-login" aria-labelledby="titulo-login">
        <h1 id="titulo-login">Iniciar sesión</h1>
        {plan && <p className="ayuda registro-plan">Seleccionaste el plan {PLANES[plan].nombre}. Jefatura puede continuar desde Mi suscripción.</p>}
        {estado.tipo === 'sin-sesion' && estado.aviso && <p className="aviso" role="status">{estado.aviso}</p>}
        {rutRegistrado && <p className="aviso aviso-exito" role="status">Cuenta creada. Ingresa con tu RUT y contraseña.</p>}
        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        <form noValidate onSubmit={ingresar} className="formulario-login" aria-busy={enviando}>
          <div className="campo">
            <label htmlFor="rut">RUT</label>
            <input
              id="rut"
              ref={campoRut}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={16}
              value={rut}
              aria-required="true"
              aria-invalid={Boolean(errorRut)}
              aria-describedby={errorRut ? 'rut-error' : 'rut-ayuda'}
              onChange={(evento) => { setRut(evento.target.value); setErrorRut('') }}
            />
            {errorRut
              ? <p id="rut-error" className="error-campo" role="alert">{errorRut}</p>
              : <p id="rut-ayuda" className="ayuda">Incluye el dígito verificador.</p>}
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <div className="entrada-password">
              <input
                id="password"
                ref={campoPassword}
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={1024}
                value={password}
                aria-required="true"
                aria-invalid={Boolean(errorPassword)}
                aria-describedby={errorPassword ? 'password-error' : undefined}
                onChange={(evento) => { setPassword(evento.target.value); setErrorPassword('') }}
              />
              <button type="button" className="boton boton-secundario" aria-controls="password"
                onClick={() => setVisible((anterior) => !anterior)}>
                <Icono nombre={visible ? 'ocultar' : 'ver'} />
                {visible ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {errorPassword && <p id="password-error" className="error-campo" role="alert">{errorPassword}</p>}
          </div>
          <button className="boton boton-primario" type="submit" disabled={enviando}>
            <Icono nombre="entrar" />
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="enlace-cuenta"><Link className="enlace-con-icono" to={rutaConPlan('/registro', plan)}><Icono nombre="cuenta" />¿No tienes cuenta? Regístrate</Link></p>
        <p className="solo-lectores" role="status">{enviando ? 'Ingresando…' : ''}</p>
      </section>
    </main>
  )
}

