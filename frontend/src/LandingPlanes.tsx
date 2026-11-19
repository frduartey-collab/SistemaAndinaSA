import { useState } from 'react'
import { Link } from 'react-router'
import { Dialogo } from './Dialogo'
import { Icono } from './Icono'
import { MarcaSigem } from './MarcaSigem'

const planes = [
  {
    id: 'particular',
    nombre: 'Particular',
    descripcion: 'Para equipos pequeños que gestionan el mantenimiento de una sede.',
    mensualidad: '$54.990',
    arranque: 'Activación sin costo · Configuración por cuenta propia',
    funciones: ['Una sede, hasta 50 equipos y 3 cuentas', 'Catálogo de equipos y reporte de fallas',
      'Asignación y seguimiento de órdenes', 'Cierre con diagnóstico, tiempos y repuestos en texto libre'],
    futuras: ['Calendario preventivo por fecha'],
  },
  {
    id: 'empresa',
    nombre: 'Empresa',
    descripcion: 'Para operaciones que necesitan coordinar el mantenimiento de toda la planta.',
    mensualidad: '$600.000',
    arranque: '$2.500.000 CLP por única vez · Puesta en marcha asistida',
    funciones: ['Capacidad acordada según la operación', 'Todo el flujo de mantenimiento de Particular',
      'Parametrización y carga inicial acordada', 'Acompañamiento al arranque'],
    futuras: ['Inventario con descuento de stock', 'Preventivos por fecha y horas con alertas',
      'Dashboards gerenciales', 'Gestión multisede', 'Integración con ERP sujeta a cotización'],
  },
] as const

export function LandingPlanes() {
  const [seleccion, setSeleccion] = useState<(typeof planes)[number] | null>(null)

  return (
    <div className="landing-planes">
      <a href="#planes" className="saltar-contenido">Saltar a los planes</a>
      <header className="planes-cabecera">
        <div className="planes-ancho">
          <MarcaSigem />
          <Link className="boton boton-secundario" to="/login">
            <Icono nombre="entrar" /> Iniciar sesión
          </Link>
        </div>
      </header>
      <main className="planes-ancho planes-contenido" id="planes">
        <h1>Planes de mantenimiento SIGEM</h1>
        <p className="planes-intro">Gestiona tus equipos, reporta fallas y da seguimiento al trabajo desde una sola plataforma.</p>
        <div className="planes-tarjetas">
          {planes.map((plan) => (
            <section className={'planes-tarjeta planes-' + plan.id} key={plan.id} aria-labelledby={'plan-' + plan.id}>
              <div className="planes-icono"><Icono nombre={plan.id === 'empresa' ? 'equipo' : 'orden'} /></div>
              <h2 id={'plan-' + plan.id}>{plan.nombre}</h2>
              <p className="planes-descripcion">{plan.descripcion}</p>
              <p className="planes-precio"><strong>{plan.mensualidad}</strong> <span>CLP / mes</span></p>
              <p className="planes-arranque">{plan.arranque}</p>
              <ul className="planes-lista">
                {plan.funciones.map((funcion) => <li key={funcion}><Icono nombre="completar" />{funcion}</li>)}
              </ul>
              <div className="planes-futuras">
                <h3>En desarrollo</h3>
                <ul className="planes-lista">
                  {plan.futuras.map((funcion) => <li key={funcion}><Icono nombre="pendiente" />{funcion}</li>)}
                </ul>
              </div>
              <button className={plan.id === 'empresa' ? 'boton boton-primario' : 'boton boton-secundario'} type="button"
                aria-label={'Seleccionar plan ' + plan.nombre} onClick={() => setSeleccion(plan)}>
                Seleccionar plan <Icono nombre="siguiente" />
              </button>
            </section>
          ))}
        </div>
        <p className="planes-nota">Precios base en pesos chilenos, antes de impuestos.</p>
      </main>
      {seleccion && (
        <Dialogo titulo={'Plan ' + seleccion.nombre} alCerrar={() => setSeleccion(null)}>
          <p>{seleccion.mensualidad} CLP al mes, antes de impuestos.</p>
          <p className="ayuda">{seleccion.arranque}</p>
          <p>La contratación y el pago estarán disponibles en una próxima etapa. Si ya tienes una cuenta, puedes ingresar a SIGEM.</p>
          <div className="dialogo-acciones">
            <button className="boton boton-secundario" type="button" onClick={() => setSeleccion(null)}>Volver a los planes</button>
            <Link className="boton boton-primario" to="/login"><Icono nombre="entrar" /> Iniciar sesión</Link>
          </div>
        </Dialogo>
      )}
    </div>
  )
}
