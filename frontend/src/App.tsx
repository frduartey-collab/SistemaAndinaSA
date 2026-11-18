import { useState } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { useAuth } from './AuthContext'
import { CatalogoEquipos } from './CatalogoEquipos'
import { Login } from './Login'
import { Registro } from './Registro'
import { ReportarFalla } from './ReportarFalla'
import type { BorradorEquipo } from './FormularioEquipo'
import { etiquetasRol } from './activos'
import { mensajeError } from './api'

function LayoutProtegido({ alSalir }: { alSalir: () => void }) {
  const { estado, puedeLeer, puedeEscribir, cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState('')

  if (estado.tipo !== 'activa') return <Navigate to="/login" replace />

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
          <div className="identidad"><span className="marca" aria-hidden="true">A</span> Manufacturas Andina</div>
          {puedeLeer && (
            <nav aria-label="Secciones de Andina">
              <NavLink className="enlace-nav" to="/equipos">Equipos</NavLink>
              <NavLink className="enlace-nav" to="/fallas">Fallas</NavLink>
              {puedeEscribir && <NavLink className="enlace-nav" to="/registro">Crear cuenta</NavLink>}
            </nav>
          )}
          <div className="cuenta">
            <div>
              <strong>{estado.usuario.nombre}</strong>
              <p className="rol">{etiquetasRol[estado.usuario.rol]}{puedeLeer && !puedeEscribir ? ' · Equipos: solo lectura' : ''}</p>
            </div>
            <button className="boton boton-secundario" type="button" onClick={salir} disabled={saliendo}>
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

export default function App() {
  const { estado, puedeLeer, reintentar } = useAuth()
  const [borrador, setBorrador] = useState<{ usuarioId: number; datos: BorradorEquipo } | null>(null)

  if (estado.tipo === 'comprobando') {
    return <main className="contenido"><p role="status">Comprobando sesión…</p></main>
  }

  if (estado.tipo === 'error') {
    return (
      <main className="contenido panel estado-pagina">
        <h1>No se pudo comprobar la sesión</h1>
        <p className="aviso aviso-error" role="alert">Comprueba que el servidor de Andina esté en marcha.</p>
        <button className="boton boton-primario" type="button" onClick={reintentar}>Reintentar</button>
      </main>
    )
  }

  const usuarioId = estado.tipo === 'activa' ? estado.usuario.id : null
  const borradorDeLaCuenta = borrador?.usuarioId === usuarioId ? borrador.datos : undefined

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route element={<LayoutProtegido alSalir={() => setBorrador(null)} />}>
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
      <Route path="*" element={<Navigate to="/equipos" replace />} />
    </Routes>
  )
}

