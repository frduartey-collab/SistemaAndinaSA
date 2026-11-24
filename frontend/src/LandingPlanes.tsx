import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { MarcaSigem } from './MarcaSigem'
import { PLANES, PESOS, rutaConPlan } from './planes'

const planes = [
  {
    id: 'particular',
    plan: 'PARTICULAR',
    descripcion: 'Para equipos pequeños que gestionan el mantenimiento de una sede.',
    arranque: 'Activación sin costo · Configuración por cuenta propia',
    funciones: ['Una sede, hasta 15 equipos y 3 cuentas', 'Catálogo de equipos y reporte de fallas',
      'Asignación y seguimiento de órdenes', 'Cierre con solución, tiempos y registro de repuestos',
      'Inventario con descuento de stock', 'Preventivos por fecha'],
  },
  {
    id: 'empresa',
    plan: 'EMPRESA',
    descripcion: 'Para operaciones que necesitan coordinar el mantenimiento de toda la planta.',
    arranque: `${PESOS.format(PLANES.EMPRESA.puestaEnMarcha)} CLP en la primera activación · Puesta en marcha asistida`,
    funciones: ['Equipos sin cupo por plan', 'Todo el flujo de mantenimiento de Particular',
      'Diagnóstico en intervenciones y dashboard gerencial',
      'Preventivos por horas de uso y alertas de vencimiento', 'Gestión multisede e integración ERP',
      'Parametrización y carga inicial acordada', 'Acompañamiento al arranque'],
  },
] as const

export function LandingPlanes() {
  const { estado } = useAuth()
  const [seleccion, setSeleccion] = useState<(typeof planes)[number] | null>(null)
  const usuario = estado.tipo === 'activa' ? estado.usuario : null

  return (
    <div className="landing-planes">
      <a href="#planes" className="saltar-contenido">Saltar a los planes</a>
      <header className="planes-cabecera">
        <div className="planes-ancho">
          <MarcaSigem />
          <Link className="boton boton-secundario" to={usuario ? '/inicio' : '/login'}>
            <Icono nombre="entrar" />{usuario ? 'Ingresar a SIGEM' : 'Iniciar sesión'}
          </Link>
        </div>
      </header>
      <main className="planes-ancho planes-contenido" id="planes">
        <h1>Planes de mantenimiento SIGEM</h1>
        <p className="planes-intro">Gestiona tus equipos, reporta fallas y da seguimiento al trabajo desde una sola plataforma.</p>
        <div className="planes-tarjetas">
          {planes.map((plan) => {
            const { nombre, mensualidad } = PLANES[plan.plan]
            return (
              <section className={'planes-tarjeta planes-' + plan.id} key={plan.id} aria-labelledby={'plan-' + plan.id}>
                <div className="planes-icono"><Icono nombre={plan.id === 'empresa' ? 'equipo' : 'orden'} /></div>
                <h2 id={'plan-' + plan.id}>{nombre}</h2>
                <p className="planes-descripcion">{plan.descripcion}</p>
                <p className="planes-precio"><strong>{PESOS.format(mensualidad)}</strong> <span>CLP / mes</span></p>
                <p className="planes-arranque">{plan.arranque}</p>
                <ul className="planes-lista">
                  {plan.funciones.map((funcion) => <li key={funcion}><Icono nombre="completar" />{funcion}</li>)}
                </ul>
                <button className={plan.id === 'empresa' ? 'boton boton-primario' : 'boton boton-secundario'} type="button"
                  aria-label={'Seleccionar plan ' + nombre} onClick={() => setSeleccion(plan)}>
                  Seleccionar plan <Icono nombre="siguiente" />
                </button>
              </section>
            )
          })}
        </div>
        <p className="planes-nota">Precios base en pesos chilenos, antes de impuestos.</p>
      </main>
      {seleccion && (
        <Dialogo titulo={'Plan ' + PLANES[seleccion.plan].nombre} alCerrar={() => setSeleccion(null)}>
          <p>{PESOS.format(PLANES[seleccion.plan].mensualidad)} CLP al mes, antes de impuestos.</p>
          <p className="ayuda">{seleccion.arranque}</p>
          <p>Seleccionar el plan solo lo deja preseleccionado. La contratación se inicia con una cuenta de Jefatura.</p>
          <div className="dialogo-acciones">
            {usuario ? (
              usuario.rol === 'JEFATURA'
                ? <Link className="boton boton-primario" to={rutaConPlan('/suscripcion', seleccion.plan)}>Ir a Mi suscripción</Link>
                : <Link className="boton boton-secundario" to="/inicio">Ingresar a SIGEM</Link>
            ) : (
              <>
                <Link className="boton boton-secundario" to={rutaConPlan('/login', seleccion.plan)}><Icono nombre="entrar" />Iniciar sesión</Link>
                <Link className="boton boton-primario" to={rutaConPlan('/registro', seleccion.plan)}><Icono nombre="cuenta" />Crear cuenta</Link>
              </>
            )}
          </div>
        </Dialogo>
      )}
    </div>
  )
}
