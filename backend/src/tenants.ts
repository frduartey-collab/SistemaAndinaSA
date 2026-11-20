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

function reconstruirCodigos(db: Database.Database, tabla: string, esquema: string, campos: string[]): void {
  const antiguas = columnas(db, tabla);
  const expresiones = campos.map(campo => {
    if (antiguas.has(campo)) return campo;
    return campo === 'tenant_id' ? String(TENANT_LEGADO_ID) : 'NULL';
  });
  const indicesCodigo = db.prepare<[string], { name: string }>(
    'SELECT name FROM pragma_index_list(?) WHERE "unique" = 1',
  ).all(tabla).filter(indice => {
    const nombres = db.prepare<[string], { name: string }>('SELECT name FROM pragma_index_info(?)').all(indice.name);
    return nombres.length === 1 && nombres[0].name === 'codigo';
  }).map(indice => indice.name);
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
    reconstruirCodigos(db, 'activos', ACTIVOS, [
      'id', 'codigo', 'nombre', 'marca', 'modelo', 'ubicacion', 'criticidad', 'estado',
      'uso_acumulado_horas', 'fecha_alta', 'deleted_at', 'sede_id', 'tenant_id',
    ]);
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

export function migrarTenantsOperativos(db: Database.Database): void {
  migrar(db, 3, () => {
    reconstruirCodigos(db, 'repuestos', REPUESTOS, [
      'id', 'codigo', 'nombre', 'descripcion', 'stock_actual', 'stock_minimo', 'deleted_at', 'tenant_id',
    ]);
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
