import type { Datos } from './datos.js';
import type { FallaRecurrente, MetricasDashboard, MetricasDashboardBase, PlanTenant, SedeRespuesta } from './dominio.js';
import { ErrorAPI } from './errores.js';

const FORMATO_CHILE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});

type Totales = Pick<MetricasDashboardBase,
  'ordenes_abiertas' | 'ordenes_vencidas' | 'mttr_minutos' | 'preventivas_en_plazo' | 'preventivas_evaluadas'>;
interface AlcanceMetricas { tenant: number; aplicar_sede: 0 | 1; sede: number | null }

export class Dashboard {
  constructor(private readonly datos: Datos) {
    this.datos.db.function('fecha_civil_chile', { deterministic: true }, valor => {
      if (typeof valor !== 'string') return null;
      const fecha = new Date(valor);
      return Number.isFinite(fecha.getTime()) ? FORMATO_CHILE.format(fecha) : null;
    });
  }

  consultar(ahora: number, plan: PlanTenant, sedeSolicitada?: number): MetricasDashboard {
    const hoy = FORMATO_CHILE.format(ahora);
    const tenant = this.datos.tenantId;
    const sedeUsuario = this.datos.sedeId;
    if (sedeSolicitada !== undefined && plan !== 'EMPRESA') {
      throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'El filtro por sede requiere el plan Empresa.');
    }
    if (sedeSolicitada !== undefined && sedeUsuario !== null && sedeUsuario !== sedeSolicitada) {
      throw new ErrorAPI(404, 'SEDE_NO_ENCONTRADA', 'La sede no está disponible para tu cuenta.');
    }

    return this.datos.db.transaction(() => {
      if (sedeSolicitada !== undefined && !this.datos.db.prepare(
        'SELECT 1 FROM sedes WHERE tenant_id = ? AND id = ?',
      ).get(tenant, sedeSolicitada)) {
        throw new ErrorAPI(404, 'SEDE_NO_ENCONTRADA', 'La sede no está disponible para tu cuenta.');
      }

      const consultarTotales = this.datos.db.prepare<AlcanceMetricas & { hoy: string }, Totales>(`
        SELECT COUNT(*) FILTER (WHERE o.estado <> 'CERRADA') AS ordenes_abiertas,
               COUNT(*) FILTER (WHERE o.estado <> 'CERRADA' AND o.fecha_limite < @hoy) AS ordenes_vencidas,
               ROUND(AVG(i.duracion_minutos) FILTER (
                 WHERE o.estado = 'CERRADA' AND o.falla_id IS NOT NULL
               ), 1) AS mttr_minutos,
               COUNT(*) FILTER (WHERE o.plan_preventivo_id IS NOT NULL AND o.estado = 'CERRADA'
                 AND fecha_civil_chile(i.registrada_en) <= o.fecha_limite) AS preventivas_en_plazo,
               COUNT(*) FILTER (WHERE o.plan_preventivo_id IS NOT NULL
                 AND (o.estado = 'CERRADA' OR o.fecha_limite < @hoy)) AS preventivas_evaluadas
        FROM ordenes_trabajo o
        LEFT JOIN fallas f ON f.id = o.falla_id AND f.tenant_id = o.tenant_id
        JOIN activos a ON a.id = COALESCE(o.equipo_id, f.equipo_id) AND a.tenant_id = o.tenant_id
        LEFT JOIN intervenciones i ON i.orden_id = o.id AND i.tenant_id = o.tenant_id
        WHERE o.tenant_id = @tenant AND (@aplicar_sede = 0 OR a.sede_id IS @sede)
      `);
      const consultarFallas = this.datos.db.prepare<AlcanceMetricas, FallaRecurrente>(`
        SELECT a.id AS equipo_id, a.codigo AS equipo_codigo, a.nombre AS equipo_nombre, COUNT(*) AS total
        FROM fallas f JOIN activos a ON a.id = f.equipo_id AND a.tenant_id = f.tenant_id
        WHERE f.tenant_id = @tenant AND (@aplicar_sede = 0 OR a.sede_id IS @sede)
        GROUP BY a.id HAVING COUNT(*) >= 2 ORDER BY total DESC, a.codigo ASC LIMIT 5
      `);
      function calcular(sede?: number | null): MetricasDashboardBase {
        const alcance: AlcanceMetricas = { tenant, aplicar_sede: sede === undefined ? 0 : 1, sede: sede ?? null };
        const totales = consultarTotales.get({ ...alcance, hoy })!;
        const fallas_recurrentes = consultarFallas.all(alcance);
        const cumplimiento_preventivo_pct = totales.preventivas_evaluadas === 0
          ? null
          : Math.round(totales.preventivas_en_plazo / totales.preventivas_evaluadas * 1000) / 10;
        return { ...totales, fallas_recurrentes, cumplimiento_preventivo_pct };
      }

      const alcance = sedeUsuario ?? sedeSolicitada;
      const metricas = calcular(alcance);
      if (plan !== 'EMPRESA' || alcance !== undefined) return metricas;

      const sedes = this.datos.db.prepare<[number], Pick<SedeRespuesta, 'id' | 'nombre'>>(`
        SELECT id, nombre FROM sedes WHERE tenant_id = ? ORDER BY nombre COLLATE NOCASE, id
      `).all(tenant);
      const por_sede: NonNullable<MetricasDashboard['por_sede']> = sedes.map(sede => ({
        sede_id: sede.id, nombre: sede.nombre, metricas: calcular(sede.id),
      }));
      if (this.datos.db.prepare('SELECT 1 FROM activos WHERE tenant_id = ? AND sede_id IS NULL LIMIT 1').get(tenant)) {
        por_sede.push({ sede_id: null, nombre: 'Sin sede asignada', metricas: calcular(null) });
      }
      return { ...metricas, por_sede };
    })();
  }
}
