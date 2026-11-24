import type { Datos } from './datos.js';
import type {
  ConsultaHistorialEquipo, FallaHistorialEquipo, HistorialEquipo, IntervencionHistorialEquipo,
  OrdenHistorialEquipo, RegistroHistorialEquipo, RepuestoConsumidoRespuesta,
} from './dominio.js';

type FilaOrden = { orden_id: null } | {
  orden_id: number;
  estado_orden: OrdenHistorialEquipo['estado'];
  fecha_limite: string;
  creada_en: string | null;
  iniciada_en: string | null;
  cerrada_en: string | null;
};
type FilaIntervencion = { intervencion_orden_id: null } | (
  Omit<IntervencionHistorialEquipo, 'repuestos_consumidos'> & { intervencion_orden_id: number }
);
type FilaHistorial = FallaHistorialEquipo & FilaOrden & FilaIntervencion & { actividad_en: string };
type FilaConsumo = RepuestoConsumidoRespuesta & { orden_id: number };

const SELECCION_HISTORIAL = `
  WITH fallas_equipo AS (
    SELECT f.id, f.tenant_id, f.descripcion, f.prioridad, f.fecha_reporte
    FROM fallas f JOIN activos a ON a.id=f.equipo_id AND a.tenant_id=f.tenant_id
    WHERE f.tenant_id = ? AND f.equipo_id = ? AND (? IS NULL OR a.sede_id = ?)
  ),
  eventos_orden AS (
    SELECT o.id AS orden_id, o.tenant_id,
           MIN(CASE WHEN a.accion = 'ORDEN_CREADA' THEN a.fecha END) AS creada_en,
           MIN(CASE WHEN a.accion = 'ORDEN_ESTADO_EN_PROGRESO' THEN a.fecha END) AS iniciada_en,
           MAX(CASE WHEN a.accion IN ('ORDEN_ESTADO_CERRADA', 'ORDEN_CERRADA_CON_INTERVENCION')
                    THEN a.fecha END) AS cerrada_en,
           MAX(a.fecha) AS ultimo_evento
    FROM fallas_equipo f
    JOIN ordenes_trabajo o ON o.falla_id = f.id AND o.tenant_id = f.tenant_id
    JOIN auditoria a ON a.entidad_id = o.id AND a.tenant_id = o.tenant_id
      AND a.accion IN ('ORDEN_CREADA', 'ORDEN_ESTADO_EN_PROGRESO',
                       'ORDEN_ESTADO_CERRADA', 'ORDEN_CERRADA_CON_INTERVENCION')
    GROUP BY o.tenant_id, o.id
  )
  SELECT f.id, f.descripcion, f.prioridad, f.fecha_reporte,
         o.id AS orden_id, o.estado AS estado_orden, o.fecha_limite,
         e.creada_en, e.iniciada_en, e.cerrada_en,
         i.orden_id AS intervencion_orden_id, i.diagnostico, i.solucion, i.duracion_minutos,
         i.registrada_en, i.repuestos_usados,
         MAX(f.fecha_reporte, COALESCE(e.ultimo_evento, f.fecha_reporte),
             COALESCE(i.registrada_en, f.fecha_reporte)) AS actividad_en
  FROM fallas_equipo f
  LEFT JOIN ordenes_trabajo o ON o.falla_id = f.id AND o.tenant_id = f.tenant_id
  LEFT JOIN eventos_orden e ON e.orden_id = o.id AND e.tenant_id = o.tenant_id
  LEFT JOIN intervenciones i ON i.orden_id = o.id AND i.tenant_id = o.tenant_id
  ORDER BY actividad_en DESC, f.id DESC
  LIMIT ? OFFSET ?
`;

export class HistorialEquipos {
  constructor(private readonly datos: Datos) {
    this.datos.db.exec(`
      CREATE INDEX IF NOT EXISTS fallas_por_equipo ON fallas(equipo_id);
      CREATE INDEX IF NOT EXISTS auditoria_por_entidad_accion ON auditoria(entidad_id, accion, fecha);
    `);
  }

  consultar(equipoId: number, consulta: ConsultaHistorialEquipo): HistorialEquipo {
    const offset = (consulta.page - 1) * consulta.size;
    return this.datos.db.transaction(() => {
      this.datos.obtener(equipoId);
      const { total } = this.datos.db.prepare<[number, number, number | null, number | null], { total: number }>(`
        SELECT count(*) AS total FROM fallas f JOIN activos a ON a.id=f.equipo_id AND a.tenant_id=f.tenant_id
        WHERE f.tenant_id = ? AND f.equipo_id = ? AND (? IS NULL OR a.sede_id = ?)
      `).get(this.datos.tenantId, equipoId, this.datos.sedeId, this.datos.sedeId)!;
      const filas = this.datos.db.prepare<[number, number, number | null, number | null, number, number], FilaHistorial>(
        SELECCION_HISTORIAL,
      ).all(this.datos.tenantId, equipoId, this.datos.sedeId, this.datos.sedeId, consulta.size, offset);
      const ordenesIntervenidas = filas.flatMap(fila =>
        fila.intervencion_orden_id === null ? [] : [fila.intervencion_orden_id],
      );
      const consumos = this.consumosPorOrden(ordenesIntervenidas);
      const items = filas.map((fila): RegistroHistorialEquipo => ({
        actividad_en: fila.actividad_en,
        falla: { id: fila.id, descripcion: fila.descripcion, prioridad: fila.prioridad, fecha_reporte: fila.fecha_reporte },
        orden: fila.orden_id === null ? null : {
          id: fila.orden_id,
          estado: fila.estado_orden,
          fecha_limite: fila.fecha_limite,
          creada_en: fila.creada_en,
          iniciada_en: fila.iniciada_en,
          cerrada_en: fila.cerrada_en,
        },
        intervencion: fila.intervencion_orden_id === null ? null : {
          diagnostico: fila.diagnostico,
          solucion: fila.solucion,
          duracion_minutos: fila.duracion_minutos,
          registrada_en: fila.registrada_en,
          repuestos_usados: fila.repuestos_usados,
          repuestos_consumidos: consumos.get(fila.intervencion_orden_id) ?? [],
        },
      }));
      return { ...consulta, items, total };
    })();
  }

  private consumosPorOrden(ordenes: number[]): Map<number, RepuestoConsumidoRespuesta[]> {
    const consumos = new Map<number, RepuestoConsumidoRespuesta[]>();
    if (ordenes.length === 0) return consumos;
    const parametros = ordenes.map(() => '?').join(', ');
    const filas = this.datos.db.prepare<number[], FilaConsumo>(`
      SELECT orden_id, repuesto_id, codigo, nombre, cantidad
      FROM orden_repuesto
      WHERE tenant_id = ? AND orden_id IN (${parametros}) ORDER BY orden_id, repuesto_id
    `).all(this.datos.tenantId, ...ordenes);
    for (const { orden_id, ...consumo } of filas) {
      const registrados = consumos.get(orden_id);
      if (registrados) registrados.push(consumo);
      else consumos.set(orden_id, [consumo]);
    }
    return consumos;
  }
}
