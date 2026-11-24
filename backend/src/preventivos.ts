import type { Datos } from './datos.js';
import type {
  CriticidadEquipo, EvaluacionPreventivosRespuesta, PlanPreventivoActualizarSolicitud,
  PlanPreventivoCrearSolicitud, PlanPreventivoRespuesta, PlanTenant,
} from './dominio.js';
import { ErrorAPI } from './errores.js';
import { fechaCivilChile, type OrdenesTrabajo } from './ordenes.js';

type Calendario = { tipo_disparador: 'FECHA'; intervalo_dias: number; proxima_fecha: string; intervalo_horas: null; proximas_horas: null };
type Horometro = { tipo_disparador: 'HORAS_USO'; intervalo_dias: null; proxima_fecha: null; intervalo_horas: number; proximas_horas: number };

type FilaPlan = Omit<PlanPreventivoRespuesta,
  'tipo_disparador' | 'intervalo_dias' | 'proxima_fecha' | 'intervalo_horas' | 'proximas_horas' | 'activo' | 'alerta_vencimiento'
> & (Calendario | Horometro) & {
  activo: 0 | 1;
  proximo_ciclo: number;
  uso_acumulado_horas: number;
  equipo_baja: string | null;
  criticidad: CriticidadEquipo;
  orden_fecha_limite: string | null;
};

const SELECCION_PLAN = `
  SELECT p.id, p.equipo_id, p.tecnico_id, p.descripcion, p.tipo_disparador, p.intervalo_dias, p.intervalo_horas,
         p.proxima_fecha, p.proximas_horas, p.activo, p.proximo_ciclo, a.codigo AS equipo_codigo,
         a.nombre AS equipo_nombre, a.uso_acumulado_horas, a.deleted_at AS equipo_baja, a.criticidad,
         o.id AS orden_abierta_id, o.fecha_limite AS orden_fecha_limite
  FROM planes_preventivos p
  JOIN activos a ON a.id = p.equipo_id AND a.tenant_id = p.tenant_id
  LEFT JOIN ordenes_trabajo o ON o.plan_preventivo_id = p.id AND o.tenant_id = p.tenant_id
                            AND o.estado IN ('PENDIENTE', 'EN_PROGRESO')
`;

const MILISEGUNDOS_DIA = 86_400_000;

function vencido(fila: FilaPlan, hoy: string): boolean {
  return fila.tipo_disparador === 'FECHA'
    ? fila.proxima_fecha <= hoy
    : fila.proximas_horas <= fila.uso_acumulado_horas;
}

function responder(fila: FilaPlan, plan: PlanTenant, hoy: string): PlanPreventivoRespuesta {
  const alerta = plan === 'EMPRESA' && (
    (fila.activo === 1 && fila.equipo_baja === null && vencido(fila, hoy))
    || (fila.orden_fecha_limite !== null && fila.orden_fecha_limite <= hoy)
  );
  const { proximo_ciclo, uso_acumulado_horas, equipo_baja, criticidad, orden_fecha_limite, ...publico } = fila;
  return { ...publico, activo: fila.activo === 1, alerta_vencimiento: alerta };
}

function siguienteFecha(actual: string, intervaloDias: number, hoy: string): string {
  const base = Date.parse(actual + 'T00:00:00Z');
  const ahora = Date.parse(hoy + 'T00:00:00Z');
  const intervalo = intervaloDias * MILISEGUNDOS_DIA;
  const fechaNueva = base + (Math.floor((ahora - base) / intervalo) + 1) * intervalo;
  const siguiente = new Date(fechaNueva).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(siguiente)) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'El siguiente vencimiento de calendario queda fuera de rango.');
  }
  return siguiente;
}

function siguientesHoras(fila: Horometro & { uso_acumulado_horas: number }): number {
  const { proximas_horas: base, intervalo_horas: intervalo, uso_acumulado_horas: actual } = fila;
  const pasos = Math.floor((actual - base) / intervalo) + 1;
  let siguiente = base + pasos * intervalo;
  if (siguiente <= actual) siguiente += intervalo;
  if (!Number.isFinite(siguiente) || siguiente > Number.MAX_SAFE_INTEGER || siguiente <= actual) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'El siguiente vencimiento por horas queda fuera de rango.');
  }
  return siguiente;
}

export class Preventivos {
  constructor(private readonly datos: Datos, private readonly ordenes: OrdenesTrabajo) {}

  listar(ahora: number, tecnicoId?: number): PlanPreventivoRespuesta[] {
    const plan = this.planActual();
    const hoy = fechaCivilChile(ahora);
    const parametros = [this.datos.tenantId];
    const filtro = (tecnicoId === undefined ? '' : ' AND p.tecnico_id = ?')
      + (this.datos.sedeId === null ? '' : ' AND a.sede_id = ?');
    if (tecnicoId !== undefined) parametros.push(tecnicoId);
    if (this.datos.sedeId !== null) parametros.push(this.datos.sedeId);
    return this.datos.db.prepare<number[], FilaPlan>(SELECCION_PLAN + ' WHERE p.tenant_id = ?' + filtro + ' ORDER BY p.id DESC')
      .all(...parametros).map(fila => responder(fila, plan, hoy));
  }

  crear(input: PlanPreventivoCrearSolicitud, actorId: number, ahora: number): PlanPreventivoRespuesta {
    return this.datos.transaccion(() => {
      const plan = this.planActual();
      this.validarProgramacion(input, plan);
      const nuevo = this.datos.db.prepare(`
        INSERT INTO planes_preventivos(
          tenant_id, equipo_id, tecnico_id, descripcion, tipo_disparador,
          intervalo_dias, intervalo_horas, proxima_fecha, proximas_horas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(this.datos.tenantId, input.equipo_id, input.tecnico_id, input.descripcion.trim(), input.tipo_disparador,
        input.intervalo_dias ?? null, input.intervalo_horas ?? null, input.proxima_fecha ?? null, input.proximas_horas ?? null);
      const id = Number(nuevo.lastInsertRowid);
      this.datos.auditar(actorId, 'PREVENTIVO_CREADO', id, ahora);
      return responder(this.obtener(id), plan, fechaCivilChile(ahora));
    });
  }

  actualizar(id: number, input: PlanPreventivoActualizarSolicitud, actorId: number, ahora: number): PlanPreventivoRespuesta {
    return this.datos.transaccion(() => {
      const plan = this.planActual();
      const previo = this.obtener(id);
      const activo = input.activo ? 1 : 0;
      if (activo !== previo.activo) {
        if (input.activo) this.validarProgramacion(previo, plan);
        this.datos.db.prepare('UPDATE planes_preventivos SET activo = ? WHERE tenant_id = ? AND id = ?')
          .run(activo, this.datos.tenantId, id);
        this.datos.auditar(actorId, input.activo ? 'PREVENTIVO_ACTIVADO' : 'PREVENTIVO_DESACTIVADO', id, ahora);
      }
      return responder({ ...previo, activo }, plan, fechaCivilChile(ahora));
    });
  }

  evaluar(ahora: number, actorId: number | null): EvaluacionPreventivosRespuesta {
    const hoy = fechaCivilChile(ahora);
    return this.datos.transaccion(() => {
      const tenant = this.datos.tenantPorId(this.datos.tenantId);
      if (tenant?.estado !== 'ACTIVO') return { generadas: 0, ordenes_ids: [] };
      const elegibles = this.datos.db.prepare<[number, number | null, number | null, string, PlanTenant], FilaPlan>(SELECCION_PLAN + `
        JOIN usuarios u ON u.id = p.tecnico_id AND u.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.activo = 1 AND a.deleted_at IS NULL AND u.activo = 1 AND u.rol = 'TECNICO'
          AND (? IS NULL OR a.sede_id = ?) AND (u.sede_id IS NULL OR u.sede_id = a.sede_id)
          AND o.id IS NULL AND (
            (p.tipo_disparador = 'FECHA' AND p.proxima_fecha <= ?)
            OR (p.tipo_disparador = 'HORAS_USO' AND p.proximas_horas <= a.uso_acumulado_horas AND ? = 'EMPRESA')
          )
        ORDER BY p.id
      `).all(tenant.id, this.datos.sedeId, this.datos.sedeId, hoy, tenant.plan);
      const avanzar = this.datos.db.prepare(`
        UPDATE planes_preventivos SET proxima_fecha = ?, proximas_horas = ?, proximo_ciclo = proximo_ciclo + 1
        WHERE tenant_id = ? AND id = ?
      `);
      const ordenes_ids = elegibles.map(fila => {
        const fecha = fila.tipo_disparador === 'FECHA' ? siguienteFecha(fila.proxima_fecha, fila.intervalo_dias, hoy) : null;
        const horas = fila.tipo_disparador === 'HORAS_USO' ? siguientesHoras(fila) : null;
        const ordenId = this.ordenes.crearPreventivaEnTransaccion({
          planId: fila.id,
          equipoId: fila.equipo_id,
          tecnicoId: fila.tecnico_id,
          ciclo: fila.proximo_ciclo,
          fechaLimite: fila.proxima_fecha ?? hoy,
          descripcion: fila.descripcion,
          prioridad: fila.criticidad,
        }, actorId, ahora);
        avanzar.run(fecha, horas, tenant.id, fila.id);
        return ordenId;
      });
      return { generadas: ordenes_ids.length, ordenes_ids };
    });
  }

  evaluarEmpresasActivas(ahora: number, errorPorEmpresa: (id: number, error: unknown) => void): void {
    const empresas = this.datos.db.prepare<[], { id: number }>("SELECT id FROM tenants WHERE estado = 'ACTIVO' ORDER BY id").all();
    for (const { id } of empresas) {
      try {
        this.datos.enTenant(id, () => this.evaluar(ahora, null));
      } catch (error) {
        errorPorEmpresa(id, error);
      }
    }
  }

  private planActual(): PlanTenant {
    const tenant = this.datos.tenantPorId(this.datos.tenantId);
    if (!tenant) throw new ErrorAPI(403, 'SIN_PERMISO', 'La empresa no está disponible.');
    return tenant.plan;
  }

  private obtener(id: number): FilaPlan {
    const fila = this.datos.db.prepare<[number, number, number | null, number | null], FilaPlan>(SELECCION_PLAN +
      ' WHERE p.tenant_id = ? AND p.id = ? AND (? IS NULL OR a.sede_id = ?)')
      .get(this.datos.tenantId, id, this.datos.sedeId, this.datos.sedeId);
    if (!fila) throw new ErrorAPI(404, 'PREVENTIVO_NO_ENCONTRADO', 'No se encontró el plan preventivo.');
    return fila;
  }

  private validarProgramacion(
    input: Pick<PlanPreventivoCrearSolicitud, 'equipo_id' | 'tecnico_id' | 'tipo_disparador'>, plan: PlanTenant,
  ): void {
    if (input.tipo_disparador === 'HORAS_USO' && plan !== 'EMPRESA') {
      throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'Programar por horas de uso requiere el plan Empresa.');
    }
    const equipo = this.datos.obtener(input.equipo_id);
    const tecnico = this.datos.usuarioPorId(input.tecnico_id);
    if (!tecnico?.activo || tecnico.rol !== 'TECNICO'
        || (tecnico.sede_id !== undefined && tecnico.sede_id !== equipo.sede_id)) {
      throw new ErrorAPI(409, 'TECNICO_NO_DISPONIBLE', 'Selecciona un técnico activo de tu empresa.');
    }
  }
}
