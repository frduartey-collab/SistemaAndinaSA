import type Database from 'better-sqlite3';

export const TENANT_LEGADO_ID = 1;

export function prepararTenants(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY,
      nombre_empresa TEXT NOT NULL CHECK (length(trim(nombre_empresa)) > 0),
      plan TEXT NOT NULL CHECK (plan IN ('PARTICULAR', 'EMPRESA')),
      fecha_suscripcion TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO'))
    );
    CREATE TABLE IF NOT EXISTS sedes (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
      direccion TEXT NOT NULL CHECK (length(trim(direccion)) > 0),
      UNIQUE (tenant_id, id)
    );
  `);
  db.prepare(
    "INSERT OR IGNORE INTO tenants(id,nombre_empresa,plan,fecha_suscripcion) VALUES (?,?,'EMPRESA',?)",
  ).run(TENANT_LEGADO_ID, 'Manufacturas Andina S.A.', new Date().toISOString());
}

const ACTIVOS = `
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 1 AND 120),
  marca TEXT CHECK(marca IS NULL OR length(marca)<=120),
  modelo TEXT CHECK(modelo IS NULL OR length(modelo)<=120),
  ubicacion TEXT NOT NULL CHECK(length(trim(ubicacion)) BETWEEN 1 AND 120),
  criticidad TEXT NOT NULL CHECK(criticidad IN ('ALTA','MEDIA','BAJA')),
  estado TEXT NOT NULL CHECK(estado IN ('OPERATIVO','EN_FALLA','EN_MANTENCIÓN','FUERA_DE_SERVICIO')),
  uso_acumulado_horas REAL NOT NULL DEFAULT 0 CHECK(uso_acumulado_horas>=0),
  fecha_alta TEXT NOT NULL,
  deleted_at TEXT,
  sede_id INTEGER,
  tenant_id INTEGER NOT NULL DEFAULT ${TENANT_LEGADO_ID} REFERENCES tenants(id),
  UNIQUE (tenant_id, codigo),
  FOREIGN KEY (tenant_id, sede_id) REFERENCES sedes(tenant_id, id),
  CHECK(length(codigo)=7 AND codigo GLOB 'EQ-[0-9][0-9][0-9][0-9]')
`;

const REPUESTOS = `
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL COLLATE NOCASE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  stock_actual INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(stock_actual) = 'integer' AND stock_actual BETWEEN 0 AND 9007199254740991),
  stock_minimo INTEGER NOT NULL
    CHECK (typeof(stock_minimo) = 'integer' AND stock_minimo BETWEEN 0 AND 9007199254740991),
  deleted_at TEXT,
  tenant_id INTEGER NOT NULL DEFAULT ${TENANT_LEGADO_ID} REFERENCES tenants(id),
  UNIQUE (tenant_id, codigo)
`;

function migrar(db: Database.Database, version: number, cambio: () => void): void {
  const aplicada = db.prepare('SELECT 1 FROM migraciones WHERE version = ?');
  if (aplicada.get(version)) return;

  // SQLite solo puede reconstruir tablas referenciadas con las claves foráneas desactivadas.
  const claves = db.pragma('foreign_keys', { simple: true });
  const alteracion = db.pragma('legacy_alter_table', { simple: true });
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  try {
    db.transaction(() => {
      if (aplicada.get(version)) return;
      cambio();
      if (db.prepare('PRAGMA foreign_key_check').get()) {
        throw new Error('La migración de empresas encontró referencias inconsistentes en SQLite.');
      }
      db.prepare('INSERT INTO migraciones(version,aplicada_en) VALUES(?,?)').run(version, new Date().toISOString());
    }).immediate();
  } finally {
    db.pragma('legacy_alter_table = ' + (alteracion === 1 ? 'ON' : 'OFF'));
    db.pragma('foreign_keys = ' + (claves === 1 ? 'ON' : 'OFF'));
  }
}

function columnas(db: Database.Database, tabla: string): Set<string> {
  return new Set(db.prepare<[string], { name: string }>('SELECT name FROM pragma_table_info(?)').all(tabla)
    .map(columna => columna.name));
}

function agregarTenant(db: Database.Database, tabla: string): void {
  if (!columnas(db, tabla).has('tenant_id')) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT ${TENANT_LEGADO_ID} REFERENCES tenants(id)`);
  }
}

function reconstruirTabla(
  db: Database.Database, tabla: string, esquema: string, campos: string[], reemplazarCodigoGlobal = false,
): void {
  const antiguas = columnas(db, tabla);
  const expresiones = campos.map(campo => {
    if (antiguas.has(campo)) return campo;
    return campo === 'tenant_id' ? String(TENANT_LEGADO_ID) : 'NULL';
  });
  const indicesCodigo = reemplazarCodigoGlobal ? db.prepare<[string], { name: string }>(
    'SELECT name FROM pragma_index_list(?) WHERE "unique" = 1',
  ).all(tabla).filter(indice => {
    const nombres = db.prepare<[string], { name: string }>('SELECT name FROM pragma_index_info(?)').all(indice.name);
    return nombres.length === 1 && nombres[0].name === 'codigo';
  }).map(indice => indice.name) : [];
  const adicionales = db.prepare<[string], { name: string; sql: string }>(`
    SELECT name, sql FROM sqlite_schema WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL
    ORDER BY type, name
  `).all(tabla);
  const nueva = tabla + '_tenant_nueva';
  db.exec(`
    CREATE TABLE ${nueva} (${esquema});
    INSERT INTO ${nueva} (${campos.join(', ')}) SELECT ${expresiones.join(', ')} FROM ${tabla};
    DROP TABLE ${tabla};
    ALTER TABLE ${nueva} RENAME TO ${tabla};
  `);
  for (const adicional of adicionales) {
    if (!indicesCodigo.includes(adicional.name)) db.exec(adicional.sql);
  }
}

interface RelacionTenant { columna: string; tabla: string; id?: string }

function protegerTenant(db: Database.Database, tabla: string, relaciones: RelacionTenant[] = []): void {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tenant_inmutable_${tabla}
    BEFORE UPDATE OF tenant_id ON ${tabla}
    WHEN NEW.tenant_id <> OLD.tenant_id
    BEGIN SELECT RAISE(ABORT, 'El tenant_id es inmutable.'); END;
  `);
  if (relaciones.length === 0) return;
  const diferencias = relaciones.map(relacion => `EXISTS (
    SELECT 1 FROM ${relacion.tabla}
    WHERE ${relacion.id ?? 'id'} = NEW.${relacion.columna} AND tenant_id <> NEW.tenant_id
  )`).join(' OR ');
  const columnasCambio = relaciones.map(relacion => relacion.columna).join(', ');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tenant_relacion_insertar_${tabla}
    BEFORE INSERT ON ${tabla}
    WHEN ${diferencias}
    BEGIN SELECT RAISE(ABORT, 'No se permiten referencias entre empresas.'); END;
    CREATE TRIGGER IF NOT EXISTS tenant_relacion_actualizar_${tabla}
    BEFORE UPDATE OF ${columnasCambio} ON ${tabla}
    WHEN ${diferencias}
    BEGIN SELECT RAISE(ABORT, 'No se permiten referencias entre empresas.'); END;
  `);
}

export function migrarTenantsBase(db: Database.Database): void {
  migrar(db, 2, () => {
    for (const tabla of ['usuarios', 'sesiones', 'auditoria']) agregarTenant(db, tabla);
    reconstruirTabla(db, 'activos', ACTIVOS, [
      'id', 'codigo', 'nombre', 'marca', 'modelo', 'ubicacion', 'criticidad', 'estado',
      'uso_acumulado_horas', 'fecha_alta', 'deleted_at', 'sede_id', 'tenant_id',
    ], true);
    protegerTenant(db, 'usuarios');
    protegerTenant(db, 'sedes');
    protegerTenant(db, 'activos');
    protegerTenant(db, 'sesiones', [{ columna: 'usuario_id', tabla: 'usuarios' }]);
    protegerTenant(db, 'auditoria', [{ columna: 'actor_id', tabla: 'usuarios' }]);
    db.exec(`
      CREATE INDEX IF NOT EXISTS activos_tenant_vigentes ON activos(tenant_id, id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS activos_por_sede ON activos(tenant_id, sede_id);
      CREATE INDEX IF NOT EXISTS usuarios_por_tenant ON usuarios(tenant_id, rol, activo);
    `);
  });
}

/** La sede del usuario es opcional; null conserva acceso al conjunto de su empresa. */
export function migrarSedesUsuarios(db: Database.Database): void {
  migrar(db, 5, () => {
    if (!columnas(db, 'usuarios').has('sede_id')) {
      db.exec('ALTER TABLE usuarios ADD COLUMN sede_id INTEGER REFERENCES sedes(id)');
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS usuario_sede_insertar
      BEFORE INSERT ON usuarios
      WHEN NEW.sede_id IS NOT NULL AND (NEW.rol = 'JEFATURA' OR NOT EXISTS (
        SELECT 1 FROM sedes WHERE id = NEW.sede_id AND tenant_id = NEW.tenant_id
      ))
      BEGIN SELECT RAISE(ABORT, 'La sede del usuario debe pertenecer a su empresa y Jefatura es global.'); END;
      CREATE TRIGGER IF NOT EXISTS usuario_sede_actualizar
      BEFORE UPDATE OF sede_id, rol ON usuarios
      WHEN NEW.sede_id IS NOT NULL AND (NEW.rol = 'JEFATURA' OR NOT EXISTS (
        SELECT 1 FROM sedes WHERE id = NEW.sede_id AND tenant_id = NEW.tenant_id
      ))
      BEGIN SELECT RAISE(ABORT, 'La sede del usuario debe pertenecer a su empresa y Jefatura es global.'); END;
      CREATE INDEX IF NOT EXISTS usuarios_por_tenant_sede ON usuarios(tenant_id, sede_id, rol, activo);
    `);
  });
}

export function migrarTenantsOperativos(db: Database.Database): void {
  migrar(db, 3, () => {
    reconstruirTabla(db, 'repuestos', REPUESTOS, [
      'id', 'codigo', 'nombre', 'descripcion', 'stock_actual', 'stock_minimo', 'deleted_at', 'tenant_id',
    ], true);
    protegerTenant(db, 'repuestos');
    const relaciones: Record<string, RelacionTenant[]> = {
      fallas: [{ columna: 'equipo_id', tabla: 'activos' }, { columna: 'usuario_id', tabla: 'usuarios' }],
      fotos_falla: [{ columna: 'falla_id', tabla: 'fallas' }],
      notificaciones_falla: [{ columna: 'falla_id', tabla: 'fallas' }, { columna: 'usuario_id', tabla: 'usuarios' }],
      ordenes_trabajo: [{ columna: 'falla_id', tabla: 'fallas' }, { columna: 'tecnico_id', tabla: 'usuarios' }],
      intervenciones: [{ columna: 'orden_id', tabla: 'ordenes_trabajo' }, { columna: 'autor_id', tabla: 'usuarios' }],
      movimientos_repuestos: [
        { columna: 'repuesto_id', tabla: 'repuestos' },
        { columna: 'usuario_id', tabla: 'usuarios' },
        { columna: 'orden_id', tabla: 'intervenciones', id: 'orden_id' },
      ],
      orden_repuesto: [
        { columna: 'orden_id', tabla: 'intervenciones', id: 'orden_id' },
        { columna: 'repuesto_id', tabla: 'repuestos' },
      ],
    };
    // Los triggers se crean después de agregar tenant_id en todas las tablas relacionadas.
    for (const tabla of Object.keys(relaciones)) agregarTenant(db, tabla);
    for (const [tabla, referencias] of Object.entries(relaciones)) protegerTenant(db, tabla, referencias);
    db.exec(`
      CREATE INDEX IF NOT EXISTS fallas_por_tenant_fecha ON fallas(tenant_id, fecha_reporte DESC, id DESC);
      CREATE INDEX IF NOT EXISTS ordenes_por_tenant ON ordenes_trabajo(tenant_id, id DESC);
    `);
  });
}

export function migrarPreventivos(db: Database.Database): void {
  migrar(db, 4, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planes_preventivos (
        id INTEGER PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        equipo_id INTEGER NOT NULL REFERENCES activos(id),
        tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
        descripcion TEXT NOT NULL CHECK(length(trim(descripcion)) BETWEEN 1 AND 2000),
        tipo_disparador TEXT NOT NULL CHECK(tipo_disparador IN ('FECHA', 'HORAS_USO')),
        intervalo_dias INTEGER CHECK(typeof(intervalo_dias) = 'integer' AND intervalo_dias BETWEEN 1 AND 36500 OR intervalo_dias IS NULL),
        intervalo_horas REAL CHECK(intervalo_horas > 0 AND intervalo_horas <= 9007199254740991 OR intervalo_horas IS NULL),
        proxima_fecha TEXT,
        proximas_horas REAL CHECK(proximas_horas BETWEEN 0 AND 9007199254740991),
        activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0, 1)),
        proximo_ciclo INTEGER NOT NULL DEFAULT 1 CHECK(typeof(proximo_ciclo) = 'integer' AND proximo_ciclo BETWEEN 1 AND 9007199254740991),
        UNIQUE (tenant_id, id, equipo_id),
        CHECK(
          (tipo_disparador = 'FECHA' AND intervalo_dias IS NOT NULL AND proxima_fecha IS NOT NULL
            AND intervalo_horas IS NULL AND proximas_horas IS NULL)
          OR (tipo_disparador = 'HORAS_USO' AND intervalo_horas IS NOT NULL AND proximas_horas IS NOT NULL
            AND intervalo_dias IS NULL AND proxima_fecha IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS preventivos_por_tenant_tecnico ON planes_preventivos(tenant_id, tecnico_id, id DESC);
    `);
    protegerTenant(db, 'planes_preventivos', [
      { columna: 'equipo_id', tabla: 'activos' },
      { columna: 'tecnico_id', tabla: 'usuarios' },
    ]);
    reconstruirTabla(db, 'ordenes_trabajo', `
      id INTEGER PRIMARY KEY,
      falla_id INTEGER UNIQUE REFERENCES fallas(id),
      tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
      fecha_limite TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'CERRADA')),
      tenant_id INTEGER NOT NULL DEFAULT ${TENANT_LEGADO_ID} REFERENCES tenants(id),
      plan_preventivo_id INTEGER,
      equipo_id INTEGER REFERENCES activos(id),
      ciclo_preventivo INTEGER CHECK(typeof(ciclo_preventivo) = 'integer' AND ciclo_preventivo BETWEEN 1 AND 9007199254740991 OR ciclo_preventivo IS NULL),
      descripcion_preventiva TEXT CHECK(length(trim(descripcion_preventiva)) BETWEEN 1 AND 2000),
      prioridad_preventiva TEXT CHECK(prioridad_preventiva IN ('ALTA', 'MEDIA', 'BAJA')),
      FOREIGN KEY (tenant_id, plan_preventivo_id, equipo_id) REFERENCES planes_preventivos(tenant_id, id, equipo_id),
      UNIQUE (tenant_id, plan_preventivo_id, ciclo_preventivo),
      CHECK(
        (falla_id IS NOT NULL AND plan_preventivo_id IS NULL AND equipo_id IS NULL AND ciclo_preventivo IS NULL
          AND descripcion_preventiva IS NULL AND prioridad_preventiva IS NULL)
        OR (falla_id IS NULL AND plan_preventivo_id IS NOT NULL AND equipo_id IS NOT NULL AND ciclo_preventivo IS NOT NULL
          AND descripcion_preventiva IS NOT NULL AND prioridad_preventiva IS NOT NULL)
      )
    `, ['id', 'falla_id', 'tecnico_id', 'fecha_limite', 'estado', 'tenant_id']);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS preventivos_orden_abierta
        ON ordenes_trabajo(tenant_id, plan_preventivo_id)
        WHERE plan_preventivo_id IS NOT NULL AND estado IN ('PENDIENTE', 'EN_PROGRESO');
      CREATE INDEX IF NOT EXISTS preventivos_ordenes_equipo
        ON ordenes_trabajo(tenant_id, equipo_id, id DESC) WHERE plan_preventivo_id IS NOT NULL;
    `);
  });
}

/** Permite registrar cierres sin diagnóstico conservando las restricciones previas. */
export function migrarDiagnosticoOpcional(db: Database.Database): void {
  migrar(db, 6, () => {
    const definicion = db.prepare<[], { sql: string }>(`
      SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'intervenciones'
    `).get()!.sql;
    const esquema = definicion.slice(definicion.indexOf('(') + 1, definicion.lastIndexOf(')'));
    const sinObligatoriedad = esquema.replace(/(\bdiagnostico\s+TEXT)\s+NOT\s+NULL\b/i, '$1');
    if (sinObligatoriedad === esquema) {
      const columna = db.prepare<[], { obligatorio: number }>(`
        SELECT "notnull" AS obligatorio FROM pragma_table_info('intervenciones') WHERE name = 'diagnostico'
      `).get();
      if (columna?.obligatorio === 0) return;
      throw new Error('No se pudo migrar el diagnóstico de las intervenciones.');
    }
    reconstruirTabla(db, 'intervenciones', sinObligatoriedad,
      ['orden_id', 'autor_id', 'diagnostico', 'solucion', 'duracion_minutos', 'repuestos_usados', 'registrada_en', 'tenant_id']);
  });
}

/** Conserva los BLOB existentes y permite que las nuevas filas apunten a un archivo privado del volumen. */
export function migrarArchivosFotos(db: Database.Database): void {
  migrar(db, 7, () => {
    reconstruirTabla(db, 'fotos_falla', `
      id INTEGER PRIMARY KEY,
      falla_id INTEGER NOT NULL REFERENCES fallas(id),
      nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 180),
      tipo TEXT NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp')),
      tenant_id INTEGER NOT NULL DEFAULT ${TENANT_LEGADO_ID} REFERENCES tenants(id),
      contenido BLOB,
      archivo TEXT UNIQUE,
      CHECK (
        (archivo IS NULL AND typeof(contenido) = 'blob' AND length(contenido) BETWEEN 3 AND 5242880)
        OR (contenido IS NULL AND archivo IS NOT NULL AND length(archivo) = 36
            AND archivo NOT GLOB '*[^0-9a-f-]*')
      )
    `, ['id', 'falla_id', 'nombre', 'tipo', 'tenant_id', 'contenido', 'archivo']);
  });
}
