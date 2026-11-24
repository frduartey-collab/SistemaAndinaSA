import { useEffect, useState } from 'react'
import type { MetricasDashboard, MetricasDashboardBase, MetricasSede } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Icono } from './Icono'
import { SelectorSede } from './SelectorSede'
import { mensajeError } from './api'

const NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
const PORCENTAJE = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 })

export function DashboardGerencial() {
  const { solicitar, estado, plan } = useAuth()
  const usuario = estado.tipo === 'activa' ? estado.usuario : null
  const sedeFija = usuario?.rol === 'SUPERVISOR' ? usuario.sede_id : undefined
  const puedeFiltrar = plan === 'EMPRESA' && sedeFija === undefined
  const [filtro, setFiltro] = useState('')
  const sedeSeleccionada = puedeFiltrar && filtro ? Number(filtro) : undefined
  const alcance = sedeFija ?? sedeSeleccionada
  const [carga, setCarga] = useState<{ metricas: MetricasDashboard; alcance?: number; plan: typeof plan } | null>(null)
  const metricas = carga?.alcance === alcance && carga?.plan === plan ? carga?.metricas : undefined
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador
    const ruta = sedeSeleccionada === undefined ? '/dashboard/metricas' : `/dashboard/metricas?sede_id=${sedeSeleccionada}` as const
    solicitar<MetricasDashboard>(ruta, { signal })
      .then((datos) => { if (!signal.aborted) setCarga({ metricas: datos, plan, ...(alcance === undefined ? {} : { alcance }) }) })
      .catch((fallo: unknown) => {
        if (!signal.aborted) setError(mensajeError(fallo, 'No se pudieron cargar las métricas.'))
      })
      .finally(() => { if (!signal.aborted) setCargando(false) })
    return () => controlador.abort()
  }, [revision, solicitar, alcance, plan, sedeSeleccionada])

  function actualizar() {
    if (cargando) return
    setError('')
    setCargando(true)
    setRevision((anterior) => anterior + 1)
  }

  return (
    <>
      <header className="encabezado-pagina">
        <div>
          <h1>Dashboard gerencial</h1>
          <p className="ayuda">{sedeFija === undefined
            ? 'Indicadores del historial de mantenimiento de tu organización.'
            : 'Indicadores del historial de mantenimiento de tu sede asignada.'}</p>
        </div>
        <button type="button" className="boton boton-secundario" onClick={actualizar} disabled={cargando}>
          <Icono nombre="sincronizar" />{error ? 'Reintentar métricas' : 'Actualizar métricas'}
        </button>
      </header>
      {puedeFiltrar && (
        <div className="dashboard-filtro">
          <SelectorSede id="dashboard-sede" etiqueta="Filtrar por sede" ninguna="Todas las sedes" valor={filtro}
            alCambiar={(valor) => {
              if (valor === filtro) return
              setError('')
              setCargando(true)
              setFiltro(valor)
            }} />
        </div>
      )}
      <p className={cargando ? 'aviso' : 'solo-lectores'} role="status">
        {cargando ? 'Cargando métricas…' : !error && metricas ? 'Métricas actualizadas.' : ''}
      </p>
      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
          {metricas && <p>Se muestran las últimas métricas cargadas.</p>}
        </div>
      )}
      {metricas && (
        <>
          <Indicadores metricas={metricas} cargando={cargando} />
          {puedeFiltrar && !filtro && metricas.por_sede?.length ? <ResumenSedes sedes={metricas.por_sede} /> : null}
        </>
      )}
    </>
  )
}

function Indicadores({ metricas, cargando }: { metricas: MetricasDashboardBase; cargando: boolean }) {
  const {
    ordenes_abiertas: abiertas, ordenes_vencidas: vencidas, mttr_minutos: mttr,
    cumplimiento_preventivo_pct: cumplimiento, preventivas_en_plazo: enPlazo,
    preventivas_evaluadas: evaluadas, fallas_recurrentes: recurrentes,
  } = metricas
  const maximoFallas = Math.max(1, ...recurrentes.map(({ total }) => total))

  return (
    <div aria-busy={cargando}>
      <dl className="indicadores-gerenciales" aria-label="Indicadores de mantenimiento">
        <div className="panel indicador-gerencial">
          <dt><Icono nombre="orden" />Órdenes abiertas</dt>
          <dd className="indicador-valor">{NUMERO.format(abiertas)}</dd>
          <dd className="ayuda">Pendientes o en progreso.</dd>
        </div>
        <div className="panel indicador-gerencial indicador-vencidas">
          <dt><Icono nombre="falla" />Órdenes vencidas</dt>
          <dd className="indicador-valor">{NUMERO.format(vencidas)}</dd>
          <dd className="ayuda">Órdenes abiertas cuyo plazo ya pasó.</dd>
        </div>
        <div className="panel indicador-gerencial">
          <dt><Icono nombre="pendiente" />Tiempo medio de reparación (MTTR)</dt>
          <dd className="indicador-valor">{mttr === null ? 'Sin datos' : NUMERO.format(mttr) + ' min'}</dd>
          <dd className="ayuda">Promedio de duración de correctivas cerradas con intervención registrada.</dd>
        </div>
        <div className="panel indicador-gerencial">
          <dt><Icono nombre="completar" />Cumplimiento preventivo</dt>
          <dd className="indicador-valor">{cumplimiento === null ? 'Sin datos' : PORCENTAJE.format(cumplimiento / 100)}</dd>
          <dd className="ayuda">{evaluadas > 0
            ? NUMERO.format(enPlazo) + ' de ' + NUMERO.format(evaluadas) + ' preventivas evaluadas se cerraron a tiempo.'
            : 'Aún no hay órdenes preventivas cerradas o vencidas.'}</dd>
          {cumplimiento !== null && (
            <dd className="metrica-barra" aria-hidden="true"><span style={{ width: cumplimiento + '%' }} /></dd>
          )}
        </div>
      </dl>

      <section className="panel fallas-gerenciales" aria-labelledby="fallas-recurrentes-titulo">
        <h2 id="fallas-recurrentes-titulo">Fallas recurrentes por equipo</h2>
        {recurrentes.length === 0 ? <p className="ayuda">Aún no hay equipos con dos o más fallas reportadas.</p> : (
          <ol className="fallas-gerenciales-lista">
            {recurrentes.map((equipo) => (
              <li key={equipo.equipo_id}>
                <div className="falla-gerencial-datos">
                  <span><strong className="codigo">{equipo.equipo_codigo}</strong> · {equipo.equipo_nombre}</span>
                  <strong>{NUMERO.format(equipo.total)} fallas</strong>
                </div>
                <div className="metrica-barra" aria-hidden="true">
                  <span style={{ width: (equipo.total / maximoFallas * 100) + '%' }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ResumenSedes({ sedes }: { sedes: MetricasSede[] }) {
  return (
    <section className="panel fallas-gerenciales dashboard-sedes" aria-labelledby="dashboard-sedes-titulo">
      <h2 id="dashboard-sedes-titulo">Métricas por sede</h2>
      <div className="tabla-contenedor" tabIndex={0} role="region" aria-labelledby="dashboard-sedes-titulo">
        <table>
          <thead><tr>
            <th scope="col">Sede</th><th scope="col">Órdenes abiertas</th><th scope="col">Órdenes vencidas</th>
            <th scope="col">MTTR</th><th scope="col">Cumplimiento preventivo</th>
          </tr></thead>
          <tbody>
            {sedes.map(({ sede_id, nombre, metricas }) => (
              <tr key={sede_id ?? 'sin-sede'}>
                <th scope="row">{nombre}</th>
                <td>{NUMERO.format(metricas.ordenes_abiertas)}</td>
                <td>{NUMERO.format(metricas.ordenes_vencidas)}</td>
                <td>{metricas.mttr_minutos === null ? 'Sin datos' : NUMERO.format(metricas.mttr_minutos) + ' min'}</td>
                <td>{metricas.cumplimiento_preventivo_pct === null ? 'Sin datos' : PORCENTAJE.format(metricas.cumplimiento_preventivo_pct / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
