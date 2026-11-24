import { createHash } from 'node:crypto';
import type { Datos } from './datos.js';
import type {
  CobroSuscripcion, EstadoSuscripcion, EventoPagoSuscripcion, PlanTenant,
  ResumenSuscripcion, SuscripcionRespuesta,
} from './dominio.js';
import { ErrorAPI } from './errores.js';

const CUOTA_CLP: Record<PlanTenant, number> = { PARTICULAR: 54_990, EMPRESA: 600_000 };
const PUESTA_EN_MARCHA_CLP = 2_500_000;
const CAMPOS_SUSCRIPCION = 'id, plan, estado, monto_clp, fecha_renovacion, metodo_pago_ref, puesta_marcha_clp';
type CanalPago = 'WEBHOOK' | 'SIMULACION';

function siguienteMes(fechaRenovacion: string | null, ahora: number): string {
  const fecha = new Date(Math.max(ahora, fechaRenovacion === null ? ahora : Date.parse(fechaRenovacion)));
  const dia = fecha.getUTCDate();
  fecha.setUTCDate(1);
  fecha.setUTCMonth(fecha.getUTCMonth() + 1);
  const ultimoDia = new Date(fecha);
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1);
  ultimoDia.setUTCDate(0);
  fecha.setUTCDate(Math.min(dia, ultimoDia.getUTCDate()));
  return fecha.toISOString();
}

function huellaEvento(pago: EventoPagoSuscripcion): string {
  return createHash('sha256').update(JSON.stringify(
    [pago.suscripcion_id, pago.monto_clp, pago.metodo_pago_ref ?? null],
  )).digest('hex');
}

export class Suscripciones {
  constructor(private readonly datos: Datos, private readonly simulacionDisponible: boolean) {
    this.datos.db.exec(`
      CREATE TABLE IF NOT EXISTS suscripciones (
        id INTEGER PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        plan TEXT NOT NULL CHECK(plan IN ('PARTICULAR', 'EMPRESA')),
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'ACTIVA', 'CANCELADA')),
        monto_clp INTEGER NOT NULL CHECK(typeof(monto_clp) = 'integer' AND monto_clp > 0),
        puesta_marcha_clp INTEGER NOT NULL CHECK(typeof(puesta_marcha_clp) = 'integer' AND puesta_marcha_clp >= 0),
        fecha_creacion TEXT NOT NULL,
        fecha_renovacion TEXT,
        fecha_cancelacion TEXT,
        metodo_pago_ref TEXT,
        UNIQUE (tenant_id, id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS suscripcion_activa_por_tenant
        ON suscripciones(tenant_id) WHERE estado = 'ACTIVA';
      CREATE UNIQUE INDEX IF NOT EXISTS suscripcion_pendiente_por_tenant
        ON suscripciones(tenant_id) WHERE estado = 'PENDIENTE';
      CREATE TRIGGER IF NOT EXISTS tenant_inmutable_suscripciones
        BEFORE UPDATE OF tenant_id ON suscripciones WHEN NEW.tenant_id <> OLD.tenant_id
        BEGIN SELECT RAISE(ABORT, 'El tenant_id es inmutable.'); END;
      CREATE TABLE IF NOT EXISTS cobros_suscripcion (
        id INTEGER PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        suscripcion_id INTEGER NOT NULL,
        canal TEXT NOT NULL CHECK(canal IN ('WEBHOOK', 'SIMULACION')),
        evento_id TEXT NOT NULL,
        huella TEXT NOT NULL,
        plan TEXT NOT NULL CHECK(plan IN ('PARTICULAR', 'EMPRESA')),
        monto_clp INTEGER NOT NULL CHECK(typeof(monto_clp) = 'integer' AND monto_clp > 0),
        puesta_marcha_clp INTEGER NOT NULL
          CHECK(typeof(puesta_marcha_clp) = 'integer' AND puesta_marcha_clp BETWEEN 0 AND monto_clp),
        fecha TEXT NOT NULL,
        metodo_pago_ref TEXT,
        UNIQUE (canal, evento_id),
        FOREIGN KEY (tenant_id, suscripcion_id) REFERENCES suscripciones(tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS cobros_por_tenant_fecha ON cobros_suscripcion(tenant_id, fecha DESC, id DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS puesta_marcha_unica_por_tenant
        ON cobros_suscripcion(tenant_id) WHERE puesta_marcha_clp > 0;
    `);
  }

  resumen(): ResumenSuscripcion {
    return this.datos.db.transaction(() => this.consultarResumen())();
  }

  checkout(plan: PlanTenant, actorId: number, ahora: number): SuscripcionRespuesta {
    return this.datos.transaccion(() => {
      const pendiente = this.porEstado('PENDIENTE');
      if (pendiente?.plan === plan) return pendiente;
      if (pendiente) throw new ErrorAPI(409, 'CHECKOUT_PENDIENTE', 'Cancela el checkout pendiente antes de elegir otro plan.');
      if (this.porEstado('ACTIVA')?.plan === plan) {
        throw new ErrorAPI(409, 'PLAN_YA_ACTIVO', 'La suscripción de ese plan ya está activa.');
      }
      const cobroPuestaMarcha = this.datos.db.prepare(
        'SELECT 1 FROM cobros_suscripcion WHERE tenant_id = ? AND puesta_marcha_clp > 0',
      ).get(this.datos.tenantId);
      const puestaMarcha = plan === 'EMPRESA' && !cobroPuestaMarcha ? PUESTA_EN_MARCHA_CLP : 0;
      const nuevo = this.datos.db.prepare(`
        INSERT INTO suscripciones(tenant_id, plan, monto_clp, puesta_marcha_clp, fecha_creacion)
        VALUES (?, ?, ?, ?, ?)
      `).run(this.datos.tenantId, plan, CUOTA_CLP[plan], puestaMarcha, new Date(ahora).toISOString());
      const id = Number(nuevo.lastInsertRowid);
      this.datos.auditar(actorId, 'SUSCRIPCION_CHECKOUT_CREADO', id, ahora);
      return this.obtener(id);
    });
  }

  cancelar(id: number, actorId: number, ahora: number): ResumenSuscripcion {
    return this.datos.transaccion(() => {
      const suscripcion = this.obtener(id);
      if (suscripcion.estado !== 'CANCELADA') {
        const fecha = new Date(ahora).toISOString();
        this.datos.db.prepare(`
          UPDATE suscripciones SET estado = 'CANCELADA', fecha_cancelacion = ? WHERE tenant_id = ? AND id = ?
        `).run(fecha, this.datos.tenantId, id);
        if (suscripcion.estado === 'ACTIVA') this.fijarPlan('PARTICULAR');
        this.datos.auditar(actorId, 'SUSCRIPCION_CANCELADA', id, ahora);
      }
      return this.consultarResumen();
    });
  }

  simularPago(id: number, actorId: number, ahora: number): ResumenSuscripcion {
    if (!this.simulacionDisponible) {
      throw new ErrorAPI(403, 'SIMULACION_PAGO_DESACTIVADA', 'La simulación de pagos está deshabilitada.');
    }
    return this.datos.transaccion(() => {
      const suscripcion = this.obtener(id);
      const pago: EventoPagoSuscripcion = {
        evento_id: 'checkout-' + id,
        suscripcion_id: id,
        monto_clp: suscripcion.monto_clp + suscripcion.puesta_marcha_clp,
        metodo_pago_ref: 'simulacion_local',
      };
      if (!this.confirmacionRepetida('SIMULACION', pago)) {
        if (suscripcion.estado !== 'PENDIENTE') {
          throw new ErrorAPI(409, 'ESTADO_SUSCRIPCION_INVALIDO', 'El simulador requiere un checkout pendiente.');
        }
        this.registrarPago('SIMULACION', pago, suscripcion, actorId, ahora);
      }
      return this.consultarResumen();
    });
  }

  confirmarWebhook(pago: EventoPagoSuscripcion, ahora: number): void {
    this.datos.transaccion(() => {
      if (this.confirmacionRepetida('WEBHOOK', pago)) return;
      const destino = this.datos.db.prepare<[number], { tenant_id: number }>(
        'SELECT tenant_id FROM suscripciones WHERE id = ?',
      ).get(pago.suscripcion_id);
      if (!destino) throw new ErrorAPI(404, 'SUSCRIPCION_NO_ENCONTRADA', 'No se encontró el checkout.');
      this.datos.enTenant(destino.tenant_id, () => {
        this.registrarPago('WEBHOOK', pago, this.obtener(pago.suscripcion_id), null, ahora);
      });
    });
  }

  private registrarPago(
    canal: CanalPago, pago: EventoPagoSuscripcion, suscripcion: SuscripcionRespuesta, actorId: number | null, ahora: number,
  ): void {
    const tenantId = this.datos.tenantId;
    const tenant = this.datos.tenantPorId(tenantId);
    if (suscripcion.estado === 'CANCELADA' || tenant?.estado !== 'ACTIVO') {
      throw new ErrorAPI(409, 'ESTADO_SUSCRIPCION_INVALIDO', 'La suscripción no puede recibir pagos en su estado actual.');
    }
    const inicial = suscripcion.estado === 'PENDIENTE';
    const puestaMarcha = inicial ? suscripcion.puesta_marcha_clp : 0;
    if (pago.monto_clp !== suscripcion.monto_clp + puestaMarcha) {
      throw new ErrorAPI(400, 'MONTO_PAGO_INVALIDO', 'El monto confirmado no coincide con el cobro esperado.');
    }
    const fecha = new Date(ahora).toISOString();
    const fechaRenovacion = siguienteMes(suscripcion.fecha_renovacion, ahora);
    const metodo = pago.metodo_pago_ref ?? suscripcion.metodo_pago_ref;
    this.datos.db.prepare(`
      INSERT INTO cobros_suscripcion(
        tenant_id, suscripcion_id, canal, evento_id, huella, plan, monto_clp, puesta_marcha_clp, fecha, metodo_pago_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tenantId, suscripcion.id, canal, pago.evento_id, huellaEvento(pago), suscripcion.plan, pago.monto_clp, puestaMarcha, fecha, metodo);
    if (inicial) {
      this.datos.db.prepare(`
        UPDATE suscripciones SET estado = 'CANCELADA', fecha_cancelacion = ? WHERE tenant_id = ? AND estado = 'ACTIVA'
      `).run(fecha, tenantId);
    }
    this.datos.db.prepare(`
      UPDATE suscripciones SET estado = 'ACTIVA', fecha_renovacion = ?, metodo_pago_ref = ?
      WHERE tenant_id = ? AND id = ?
    `).run(fechaRenovacion, metodo, tenantId, suscripcion.id);
    this.fijarPlan(suscripcion.plan);
    this.datos.auditar(actorId, inicial ? 'SUSCRIPCION_ACTIVADA' : 'SUSCRIPCION_RENOVADA', suscripcion.id, ahora);
  }

  private confirmacionRepetida(canal: CanalPago, pago: EventoPagoSuscripcion): boolean {
    const previa = this.datos.db.prepare<[CanalPago, string], { huella: string }>(
      'SELECT huella FROM cobros_suscripcion WHERE canal = ? AND evento_id = ?',
    ).get(canal, pago.evento_id);
    if (!previa) return false;
    if (previa.huella !== huellaEvento(pago)) {
      throw new ErrorAPI(409, 'EVENTO_PAGO_CONFLICTO', 'El identificador del evento ya se procesó con otros datos.');
    }
    return true;
  }

  private consultarResumen(): ResumenSuscripcion {
    const tenant = this.datos.tenantPorId(this.datos.tenantId);
    if (!tenant) throw new ErrorAPI(403, 'SIN_PERMISO', 'La empresa no está disponible.');
    const cobros = this.datos.db.prepare<[number], CobroSuscripcion>(`
      SELECT id, suscripcion_id, plan, monto_clp, puesta_marcha_clp, fecha, metodo_pago_ref
      FROM cobros_suscripcion WHERE tenant_id = ? ORDER BY fecha DESC, id DESC
    `).all(tenant.id);
    return {
      plan_actual: tenant.plan,
      activa: this.porEstado('ACTIVA') ?? null,
      pendiente: this.porEstado('PENDIENTE') ?? null,
      cobros,
      simulacion_disponible: this.simulacionDisponible,
    };
  }

  private porEstado(estado: EstadoSuscripcion): SuscripcionRespuesta | undefined {
    return this.datos.db.prepare<[number, EstadoSuscripcion], SuscripcionRespuesta>(
      'SELECT ' + CAMPOS_SUSCRIPCION + ' FROM suscripciones WHERE tenant_id = ? AND estado = ?',
    ).get(this.datos.tenantId, estado);
  }

  private obtener(id: number): SuscripcionRespuesta {
    const suscripcion = this.datos.db.prepare<[number, number], SuscripcionRespuesta>(
      'SELECT ' + CAMPOS_SUSCRIPCION + ' FROM suscripciones WHERE tenant_id = ? AND id = ?',
    ).get(this.datos.tenantId, id);
    if (!suscripcion) throw new ErrorAPI(404, 'SUSCRIPCION_NO_ENCONTRADA', 'No se encontró la suscripción.');
    return suscripcion;
  }

  private fijarPlan(plan: PlanTenant): void {
    this.datos.db.prepare('UPDATE tenants SET plan = ? WHERE id = ?').run(plan, this.datos.tenantId);
  }
}
