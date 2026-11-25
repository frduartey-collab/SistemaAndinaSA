import { Icono } from './Icono'
import { MarcaSigem } from './MarcaSigem'
import { BotonTema } from './TemaInterfaz'
import { useState } from 'react'
import { AjustesInterfaz } from './AjustesInterfaz'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './AuthContext'
import { AvisosFallas } from './AvisosFallas'
import { CatalogoEquipos } from './CatalogoEquipos'
import { DashboardGerencial } from './DashboardGerencial'
import { DetalleFalla } from './DetalleFalla'
import { GestionSedes } from './GestionSedes'
import { InicioTrabajador } from './InicioTrabajador'
import { IntegracionERP } from './IntegracionERP'
import { InventarioBodega } from './InventarioBodega'
import { LandingPlanes } from './LandingPlanes'
import { Login } from './Login'
import { MantenimientoPreventivo } from './MantenimientoPreventivo'
import { MiSuscripcion } from './MiSuscripcion'
import { Registro } from './Registro'
import { ReportarFalla } from './ReportarFalla'
import { OrdenesTrabajo } from './OrdenesTrabajo'
import type { BorradorEquipo } from './FormularioEquipo'
import { etiquetasRol } from './activos'
import { mensajeError } from './api'
import { leerPlan, rutaConPlan } from './planes'

function LayoutProtegido({ alSalir, puedeVerOrdenes, puedeVerInventario, puedeVerDashboard }: {
  alSalir: () => void
  puedeVerOrdenes: boolean
  puedeVerInventario: boolean
  puedeVerDashboard: boolean
}) {
  const { estado, plan, puedeLeer, puedeEscribir, cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState('')
  const { pathname, search } = useLocation()

  if (estado.tipo !== 'activa') {
    const planSolicitado = pathname === '/suscripcion' ? leerPlan(new URLSearchParams(search)) : null
    return <Navigate to={rutaConPlan('/login', planSolicitado)} replace />
  }

  async function salir() {
    if (saliendo) return
    setSaliendo(true)
    setError('')

    try {
      await cerrarSesion()
      alSalir()
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo cerrar sesión. Inténtalo de nuevo.'))
    } finally {
      setSaliendo(false)
    }
  }

  return (
    <>
      <a href="#contenido" className="saltar-contenido">Saltar al contenido</a>
      <header className="cabecera">
        <div className="cabecera-interior">
          <MarcaSigem />
          {(puedeLeer || puedeVerInventario || plan === 'EMPRESA') && (
            <nav className="navegacion-sigem" aria-label="Secciones de SIGEM">
              {estado.usuario.rol === 'TRABAJADOR' && (
                <NavLink className="enlace-nav" to="/inicio" end><span className="icono-nav"><Icono nombre="inicio" /></span>Inicio</NavLink>
              )}
              {puedeLeer && (
                <>
                  {puedeVerDashboard && (
                    <NavLink className="enlace-nav" to="/dashboard"><span className="icono-nav"><Icono nombre="grafico" /></span>Dashboard gerencial</NavLink>
                  )}
                  <NavLink className="enlace-nav" to="/equipos"><span className="icono-nav"><Icono nombre="equipo" /></span>Equipos</NavLink>
                  <NavLink className="enlace-nav" to="/fallas"><span className="icono-nav"><Icono nombre="falla" /></span>Fallas</NavLink>
                </>
              )}
              {puedeVerOrdenes && (
                <>
                  <NavLink className="enlace-nav" to="/ordenes"><span className="icono-nav"><Icono nombre="orden" /></span>Órdenes</NavLink>
                  <NavLink className="enlace-nav" to="/preventivos"><span className="icono-nav"><Icono nombre="pendiente" /></span>Preventivos</NavLink>
                </>
              )}
              {puedeVerInventario && (
                <NavLink className="enlace-nav" to="/inventario"><span className="icono-nav"><Icono nombre="inventario" /></span>Inventario</NavLink>
              )}
              {plan === 'EMPRESA' && (
                <NavLink className="enlace-nav" to="/sedes"><span className="icono-nav"><Icono nombre="sede" /></span>Sedes y Sucursales</NavLink>
              )}
              {puedeEscribir && (
                <NavLink className="enlace-nav" to="/avisos"><span className="icono-nav"><Icono nombre="aviso" /></span>Avisos</NavLink>
              )}
              {estado.usuario.rol === 'JEFATURA' && (
                <>
                  <NavLink className="enlace-nav" to="/suscripcion"><span className="icono-nav"><Icono nombre="pago" /></span>Mi suscripción</NavLink>
                  {plan === 'EMPRESA' && <NavLink className="enlace-nav" to="/integraciones/erp"><span className="icono-nav"><Icono nombre="cambiar" /></span>Integración ERP</NavLink>}
                </>
              )}
              {puedeEscribir && <NavLink className="enlace-nav" to="/registro"><span className="icono-nav"><Icono nombre="cuenta" /></span>Crear cuenta</NavLink>}
            </nav>
          )}
          <div className="cuenta">
            <div>
              <strong>{estado.usuario.nombre}</strong>
              <p className="rol">{etiquetasRol[estado.usuario.rol]}{puedeLeer && !puedeEscribir ? ' · Equipos: solo lectura' : ''}</p>
            </div>
            <BotonTema />
            <AjustesInterfaz />
            <button className="boton boton-secundario" type="button" onClick={salir} disabled={saliendo}>
              <Icono nombre="salir" />
              {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
        <p role="status" className="solo-lectores">{saliendo ? 'Cerrando sesión…' : ''}</p>
        {error && <p className="aviso aviso-error salida-error" role="alert">{error}</p>}
      </header>
      <main className="contenido" id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}

function Sistema() {
  const { estado, plan, puedeLeer, puedeEscribir, reintentar } = useAuth()
  const [borrador, setBorrador] = useState<{ usuarioId: number; datos: BorradorEquipo } | null>(null)

  if (estado.tipo === 'comprobando') {
    return <main className="contenido"><p role="status">Comprobando sesión…</p></main>
  }

  if (estado.tipo === 'error') {
    return (
      <main className="contenido panel estado-pagina">
        <h1>No se pudo comprobar la sesión</h1>
        <p className="aviso aviso-error" role="alert">Comprueba que el servidor de Andina esté en marcha.</p>
        <button className="boton boton-primario" type="button" onClick={reintentar}><Icono nombre="sincronizar" />Reintentar</button>
      </main>
    )
  }

  const usuarioId = estado.tipo === 'activa' ? estado.usuario.id : null
  const rol = estado.tipo === 'activa' ? estado.usuario.rol : null
  const puedeVerOrdenes = rol === 'TECNICO' || puedeEscribir
  const puedeVerInventario = rol === 'BODEGA' || rol === 'JEFATURA'
  const puedeVerDashboard = puedeEscribir && plan === 'EMPRESA'
  let destinoInicio = '/equipos'
  if (rol === 'TECNICO') destinoInicio = '/ordenes'
  if (rol === 'BODEGA') destinoInicio = '/inventario'
  const borradorDeLaCuenta = borrador?.usuarioId === usuarioId ? borrador.datos : undefined

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={estado.tipo === 'activa' && !puedeEscribir
        ? <Navigate to="/inicio" replace /> : <Registro />} />
      <Route element={<LayoutProtegido alSalir={() => setBorrador(null)} puedeVerOrdenes={puedeVerOrdenes}
        puedeVerInventario={puedeVerInventario} puedeVerDashboard={puedeVerDashboard} />}>
        <Route path="/inicio" element={rol === 'TRABAJADOR'
          ? <InicioTrabajador />
          : <Navigate to={destinoInicio} replace />} />
        <Route path="/dashboard" element={puedeVerDashboard ? <DashboardGerencial key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>El dashboard gerencial está disponible para Supervisor y Jefatura del Plan Empresa.</p>
          </section>
        )} />
        <Route path="/suscripcion" element={rol === 'JEFATURA' ? <MiSuscripcion key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>La gestión de la suscripción está disponible para Jefatura.</p>
          </section>
        )} />
        <Route path="/integraciones/erp" element={rol === 'JEFATURA' && plan === 'EMPRESA' ? <IntegracionERP key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>Integración ERP está disponible para Jefatura del Plan Empresa.</p>
          </section>
        )} />
        <Route
          path="/equipos"
          element={puedeLeer && usuarioId !== null ? (
            <CatalogoEquipos
              key={usuarioId}
              borrador={borradorDeLaCuenta}
              alConservarBorrador={(datos) => setBorrador(datos ? { usuarioId, datos } : null)}
            />
          ) : <Navigate to="/sin-acceso" replace />}
        />
        <Route path="/fallas" element={puedeLeer ? <ReportarFalla /> : <Navigate to="/sin-acceso" replace />} />
        <Route path="/fallas/:id" element={puedeLeer ? <DetalleFalla /> : <Navigate to="/sin-acceso" replace />} />
        <Route path="/avisos" element={puedeEscribir ? <AvisosFallas key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>Los avisos de fallas están disponibles para Supervisor y Jefatura.</p>
          </section>
        )} />
        <Route path="/ordenes" element={puedeVerOrdenes
          ? <OrdenesTrabajo />
          : <Navigate to={puedeLeer ? '/fallas' : '/sin-acceso'} replace />} />
        <Route path="/preventivos" element={puedeVerOrdenes
          ? <MantenimientoPreventivo key={usuarioId} />
          : <Navigate to={puedeLeer ? '/fallas' : '/sin-acceso'} replace />} />
        <Route path="/inventario" element={puedeVerInventario ? <InventarioBodega key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>Inventario está disponible para Bodega y Jefatura.</p>
          </section>
        )} />
        <Route path="/sedes" element={plan === 'EMPRESA' ? <GestionSedes key={usuarioId} /> : (
          <section className="panel estado-pagina">
            <h1>Acceso restringido</h1>
            <p>Sedes y Sucursales está disponible para el Plan Empresa.</p>
          </section>
        )} />
        <Route
          path="/sin-acceso"
          element={puedeLeer ? <Navigate to="/equipos" replace /> : (
            <section className="panel estado-pagina">
              <h1>Acceso restringido</h1>
              <p>Tu rol no tiene acceso al catálogo de equipos ni a los reportes de fallas.</p>
            </section>
          )}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPlanes />} />
      <Route path="/*" element={<Sistema />} />
    </Routes>
  )
}
