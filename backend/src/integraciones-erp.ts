import { createHash, randomBytes } from 'node:crypto';
import type { Datos } from './datos.js';
import type {
  ClaveERP, EstadoTenant, IntegracionERPRespuesta, IntegracionERPSolicitud, PaginaCostosERP,
  PlanTenant, StockERP, SyncStockERPRespuesta, SyncStockERPSolicitud,
} from './dominio.js';
import { ErrorAPI } from './errores.js';
import type { InventarioRepuestos } from './repuestos.js';

const PREFIJO_CLAVE = 'sigem_erp_';
const FORMATO_CLAVE = /^sigem_erp_[A-Za-z0-9_-]{43}$/;
type ConfiguracionERP = {
  webhook_url: string | null;
  activo: 0 | 1;
  api_key_hash: string | null;
  clave_creada_por: number | null;
};
type AutorizacionERP = { tenant_id: number; activo: 0 | 1; plan: PlanTenant; estado: EstadoTenant };

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function validarUrl(endpoint: string | null): void {
  if (endpoint === null) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol === 'https:' && !url.username && !url.password && !/[\s?#]/u.test(endpoint)) return;
  } catch {
    // Las URL inválidas reciben el mismo error del contrato.
  }
  throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La URL debe ser HTTPS y no puede incluir credenciales, parámetros ni fragmentos.');
}

function normalizarItems(entrada: StockERP[]): StockERP[] {
  const items = entrada.map(({ codigo, stock_actual }) => ({ codigo: codigo.toUpperCase(), stock_actual }));
  if (new Set(items.map(item => item.codigo)).size !== items.length) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'Envía cada código de repuesto una sola vez en el lote.');
  }
  return items.sort((a, b) => {
    if (a.codigo === b.codigo) return 0;
    return a.codigo < b.codigo ? -1 : 1;
  });
}

export class IntegracionesERP {
  constructor(private readonly datos: Datos, private readonly inventario: InventarioRepuestos) {
    this.datos.transaccion(() => {
      const columna = this.datos.db.prepare(
        "SELECT 1 FROM pragma_table_info('repuestos') WHERE name = 'costo_unitario_clp'",
      ).get();
      if (!columna) {
        this.datos.db.exec(`
          ALTER TABLE repuestos ADD COLUMN costo_unitario_clp INTEGER
            CHECK (costo_unitario_clp IS NULL OR (
              typeof(costo_unitario_clp) = 'integer' AND costo_unitario_clp BETWEEN 0 AND 1000000000
            ));
        `);
      }
      this.datos.db.exec(`
        CREATE TABLE IF NOT EXISTS integraciones_erp (
          id INTEGER PRIMARY KEY,
          tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id),
          webhook_url TEXT,
          activo INTEGER NOT NULL DEFAULT 0 CHECK(activo IN (0,1)),
          api_key_hash TEXT UNIQUE,
          clave_creada_por INTEGER REFERENCES usuarios(id),
          CHECK((api_key_hash IS NULL AND clave_creada_por IS NULL) OR (api_key_hash IS NOT NULL AND clave_creada_por IS NOT NULL)),
          CHECK(activo = 0 OR api_key_hash IS NOT NULL)
        );
        CREATE TABLE IF NOT EXISTS lotes_stock_erp (
          tenant_id INTEGER NOT NULL REFERENCES tenants(id),
          referencia TEXT NOT NULL,
          huella TEXT NOT NULL,
          actualizados INTEGER NOT NULL CHECK(actualizados BETWEEN 0 AND 100),
          fecha TEXT NOT NULL,
          PRIMARY KEY (tenant_id, referencia)
        );
      `);
    });
  }

  obtener(): IntegracionERPRespuesta {
    const configuracion = this.filaActual();
    return {
      webhook_url: configuracion?.webhook_url ?? null,
      activo: configuracion?.activo === 1,
      clave_configurada: Boolean(configuracion?.api_key_hash),
    };
  }

  configurar(input: IntegracionERPSolicitud, actorId: number, ahora: number): IntegracionERPRespuesta {
    validarUrl(input.webhook_url);
    return this.datos.transaccion(() => {
      const configuracion = this.filaActual();
      if (input.activo && !configuracion?.api_key_hash) {
        throw new ErrorAPI(409, 'CLAVE_ERP_REQUERIDA', 'Genera una API Key antes de activar la integración.');
      }
      if (configuracion) {
        this.datos.db.prepare('UPDATE integraciones_erp SET webhook_url = ?, activo = ? WHERE tenant_id = ?')
          .run(input.webhook_url, Number(input.activo), this.datos.tenantId);
      } else {
        this.datos.db.prepare('INSERT INTO integraciones_erp(tenant_id, webhook_url) VALUES (?, ?)')
          .run(this.datos.tenantId, input.webhook_url);
      }
      this.datos.auditar(actorId, 'ERP_CONFIGURADO', this.datos.tenantId, ahora);
      return this.obtener();
    });
  }

  generarClave(actorId: number, ahora: number): ClaveERP {
    const api_key = PREFIJO_CLAVE + randomBytes(32).toString('base64url');
    const hash = sha256(api_key);
    this.datos.transaccion(() => {
      this.datos.db.prepare(`
        INSERT INTO integraciones_erp(tenant_id, api_key_hash, clave_creada_por) VALUES (?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          api_key_hash = excluded.api_key_hash, clave_creada_por = excluded.clave_creada_por
      `).run(this.datos.tenantId, hash, actorId);
      this.datos.auditar(actorId, 'ERP_CLAVE_ROTADA', this.datos.tenantId, ahora);
    });
    return { api_key };
  }

  autenticar(apiKey: string | undefined): number {
    const resultado = apiKey !== undefined && FORMATO_CLAVE.test(apiKey)
      ? this.datos.db.prepare<[string], AutorizacionERP>(`
          SELECT t.id AS tenant_id, e.activo, t.plan, t.estado
          FROM integraciones_erp e
          JOIN tenants t ON t.id = e.tenant_id
          WHERE e.api_key_hash = ?
        `).get(sha256(apiKey))
      : undefined;
    if (!resultado) throw new ErrorAPI(401, 'CLAVE_ERP_INVALIDA', 'Se requiere una API Key ERP válida.');
    if (resultado.plan !== 'EMPRESA') {
      throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'La integración ERP requiere el plan Empresa.');
    }
    if (!resultado.activo || resultado.estado !== 'ACTIVO') {
      throw new ErrorAPI(403, 'INTEGRACION_ERP_INACTIVA', 'La integración ERP está desactivada.');
    }
    return resultado.tenant_id;
  }

  costos(page: number, size: number): PaginaCostosERP {
    return this.inventario.exportarCostosERP(page, size);
  }

  sincronizar(input: SyncStockERPSolicitud, ahora: number): SyncStockERPRespuesta {
    const items = normalizarItems(input.items);
    const huella = sha256(JSON.stringify(items));
    return this.datos.transaccion(() => {
      const tenantId = this.datos.tenantId;
      const empresa = this.datos.tenantPorId(tenantId);
      if (empresa?.plan !== 'EMPRESA') {
        throw new ErrorAPI(403, 'PLAN_EMPRESA_REQUERIDO', 'La integración ERP requiere el plan Empresa.');
      }
      const configuracion = this.filaActual();
      if (!configuracion?.activo || configuracion.clave_creada_por === null || empresa.estado !== 'ACTIVO') {
        throw new ErrorAPI(403, 'INTEGRACION_ERP_INACTIVA', 'La integración ERP está desactivada.');
      }
      const anterior = this.datos.db.prepare<[number, string], { huella: string; actualizados: number }>(
        'SELECT huella, actualizados FROM lotes_stock_erp WHERE tenant_id = ? AND referencia = ?',
      ).get(tenantId, input.referencia);
      if (anterior) {
        if (anterior.huella !== huella) {
          throw new ErrorAPI(409, 'REFERENCIA_ERP_CONFLICTO', 'La referencia ya se usó con otro lote de stock.');
        }
        return { referencia: input.referencia, actualizados: anterior.actualizados };
      }
      let actualizados = 0;
      for (const item of items) {
        if (this.inventario.ajustarStockERPEnTransaccion(item, input.referencia, configuracion.clave_creada_por, ahora)) {
          actualizados += 1;
        }
      }
      this.datos.db.prepare(`
        INSERT INTO lotes_stock_erp(tenant_id, referencia, huella, actualizados, fecha) VALUES (?, ?, ?, ?, ?)
      `).run(tenantId, input.referencia, huella, actualizados, new Date(ahora).toISOString());
      return { referencia: input.referencia, actualizados };
    });
  }

  private filaActual(): ConfiguracionERP | undefined {
    return this.datos.db.prepare<[number], ConfiguracionERP>(`
      SELECT webhook_url, activo, api_key_hash, clave_creada_por FROM integraciones_erp WHERE tenant_id = ?
    `).get(this.datos.tenantId);
  }
}
