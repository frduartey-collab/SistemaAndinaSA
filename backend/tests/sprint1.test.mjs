import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearAplicacion } from '../dist/app.js';
import Database from 'better-sqlite3';
import { scryptSync } from 'node:crypto';
import { Datos } from '../dist/datos.js';
import { hashPassword, verificarPassword, rutValido } from '../dist/seguridad.js';
import { esquema } from '../dist/validacion.js';
const SECRET = 'clave-exclusiva-de-pruebas-no-utilizar-en-produccion';
const PASSWORD = 'SoloPruebas-2026-Local';
const baseHash = hashPassword(PASSWORD);
const ruts = { SUPERVISOR: '12345678-5', TECNICO: '11111111-1', TRABAJADOR: '22222222-2', BODEGA: '33333333-3', JEFATURA: '44444444-4' };
const nuevo = { codigo: 'EQ-0001', nombre: 'Prensa', ubicacion: 'Planta A', criticidad: 'ALTA' };
async function fixture(t, options = {}) {
    const datos = options.datos ?? new Datos();
    for (const [rol, rut] of Object.entries(ruts)) {
        if (!datos.usuarioPorRut(rut))
            datos.crearUsuario({ rut, nombre: rol, rol: rol, activo: true, passwordHash: await baseHash });
    }
    let now = Date.UTC(2026, 10, 12, 12);
    const backend = await crearAplicacion({ datos, secret: SECRET, now: () => now, tokenSeconds: options.ttl ?? 28800, maxAttempts: options.max ?? 5 });
    const server = createServer(backend.app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(() => resolve())); backend.close(); });
    async function request(method, path, body, token) {
        const headers = {};
        if (body !== undefined)
            headers['Content-Type'] = 'application/json';
        if (token)
            headers.Authorization = 'Bearer ' + token;
        return fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    async function login(rol = 'SUPERVISOR') {
        const response = await request('POST', '/auth/login', { rut: ruts[rol], password: PASSWORD });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert(esquema('auth', 'LoginRespuesta')(body));
        assert.equal(body.expiraEn, options.ttl ?? 28800);
        return body.token;
    }
    return { datos, url, request, login, advance: (ms) => { now += ms; }, time: () => now };
}
test('GWT-HU01-01 RF-01: login válido devuelve JWT, usuario y expiración según contrato', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    assert.equal(token.split('.').length, 3);
    const response = await f.request('GET', '/auth/me', undefined, token);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert(esquema('auth', 'UsuarioSesion')(body));
    assert.equal(body.rol, 'SUPERVISOR');
    assert(!('passwordHash' in body));
});
test('GWT-HU01-02 RF-01: RUT inválido por formato y dígito devuelve 400 RUT_INVALIDO', async (t) => {
    const f = await fixture(t);
    for (const rut of ['12.345.678-5', '12345678-9', '00000000-0']) {
        const response = await f.request('POST', '/auth/login', { rut, password: PASSWORD });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).codigo, 'RUT_INVALIDO');
    }
});
test('GWT-HU01-03 RF-01: usuario desconocido y contraseña errónea dan el mismo 401', async (t) => {
    const f = await fixture(t);
    for (const body of [{ rut: ruts.SUPERVISOR, password: 'incorrecta' }, { rut: '55555555-5', password: PASSWORD }]) {
        const response = await f.request('POST', '/auth/login', body);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).codigo, 'CREDENCIALES_INVALIDAS');
    }
});
test('GWT-HU01-04 RF-01: usuario inactivo con contraseña correcta recibe 403', async (t) => {
    const f = await fixture(t);
    f.datos.db.prepare('UPDATE usuarios SET activo=0 WHERE rut=?').run(ruts.TECNICO);
    const response = await f.request('POST', '/auth/login', { rut: ruts.TECNICO, password: PASSWORD });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).codigo, 'USUARIO_INACTIVO');
});
test('GWT-HU01-05 RF-01/RNF-07: cinco fallos por RUT, sexto 429 y ventana de cinco minutos', async (t) => {
    const f = await fixture(t);
    for (let i = 0; i < 5; i++)
        assert.equal((await f.request('POST', '/auth/login', { rut: ruts.SUPERVISOR, password: 'mal' })).status, 401);
    const blocked = await f.request('POST', '/auth/login', { rut: ruts.SUPERVISOR, password: 'mal' });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).codigo, 'DEMASIADOS_INTENTOS');
    assert.equal(blocked.headers.get('Retry-After'), '300');
    assert.equal((await f.request('POST', '/auth/login', { rut: ruts.SUPERVISOR, password: PASSWORD })).status, 429);
    assert(await f.login('TECNICO')); // otro RUT desde la misma IP sigue permitido
    f.advance(300001);
    assert(await f.login());
});
test('GWT-HU01-06 RF-01: logout 204 invalida el mismo token', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const out = await f.request('POST', '/auth/logout', undefined, token);
    assert.equal(out.status, 204);
    assert.equal(await out.text(), '');
    for (const path of ['/auth/me', '/activos'])
        assert.equal((await f.request('GET', path, undefined, token)).status, 401);
    assert.equal((await f.request('POST', '/auth/logout', undefined, token)).status, 401);
});
test('GWT-HU01-07 RF-01: ausencia, manipulación y expiración de JWT dan 401 Bearer', async (t) => {
    const f = await fixture(t, { ttl: 10 });
    const token = await f.login();
    for (const value of [undefined, 'no-es-jwt', token.slice(0, -8) + 'AAAAAAAA']) {
        const response = await f.request('GET', '/auth/me', undefined, value);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
    }
    f.advance(10001);
    assert.equal((await f.request('GET', '/auth/me', undefined, token)).status, 401);
});
test('GWT-HU01-08 RF-01/RNF-05: desactivar usuario revoca acceso efectivo de token vigente', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    f.datos.db.prepare('UPDATE usuarios SET activo=0 WHERE rut=?').run(ruts.SUPERVISOR);
    assert.equal((await f.request('GET', '/auth/me', undefined, token)).status, 401);
});
test('GWT-HU01-09 RF-01: payload incompleto o con propiedades adicionales da 400', async (t) => {
    const f = await fixture(t);
    for (const body of [{ rut: ruts.SUPERVISOR }, { rut: ruts.SUPERVISOR, password: PASSWORD, rol: 'SUPERVISOR' }]) {
        const response = await f.request('POST', '/auth/login', body);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).codigo, 'DATOS_INVALIDOS');
    }
});
test('GWT-HU01-10 RF-01/RNF-07: bcrypt con sal y compatibilidad de hashes anteriores', async (t) => {
    const a = await baseHash, b = await hashPassword(PASSWORD);
    assert.notEqual(a, b);
    assert(!a.includes(PASSWORD));
    assert(await verificarPassword(PASSWORD, a));
    assert(!(await verificarPassword('mal', a)));
    assert(!(await verificarPassword(PASSWORD, 'roto')));
    assert(a.startsWith('$2b$12$'));
    const salt = Buffer.alloc(16, 1);
    const legacyHash = password => 'scrypt$32768$8$3$' + salt.toString('hex') + '$' + scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex');
    const f = await fixture(t);
    f.datos.db.prepare('UPDATE usuarios SET password_hash=? WHERE rut=?').run(legacyHash(PASSWORD), ruts.SUPERVISOR);
    await f.login();
    assert(f.datos.usuarioPorRut(ruts.SUPERVISOR).passwordHash.startsWith('$2b$12$'));
    const largo = 'x'.repeat(73), hashLargo = legacyHash(largo);
    assert(await verificarPassword(largo, hashLargo));
    await assert.rejects(hashPassword(largo), /72 bytes/);
    assert(rutValido('12345678-5'));
    assert(!rutValido('12345678-1'));
});
test('GWT-HU01-11 RF-01: dos sesiones independientes, cerrar una no cierra la otra', async (t) => {
    const f = await fixture(t);
    const a = await f.login(), b = await f.login();
    assert.notEqual(a, b);
    await f.request('POST', '/auth/logout', undefined, a);
    assert.equal((await f.request('GET', '/auth/me', undefined, b)).status, 200);
});
test('GWT-HU01-12 RNF-07: secreto insuficiente impide inicializar servidor', async () => {
    await assert.rejects(crearAplicacion({ secret: 'corta' }), /32 bytes/);
});
test('GWT-HU02-01 RF-02: crear, listar y consultar equipo con ubicación y criticidad', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const created = await f.request('POST', '/activos', nuevo, token);
    assert.equal(created.status, 201);
    const body = await created.json();
    assert(esquema('activos', 'ActivoRespuesta')(body));
    assert.equal(body.ubicacion, 'Planta A');
    assert.equal(body.criticidad, 'ALTA');
    assert.equal(body.estado, 'OPERATIVO');
    assert.equal(created.headers.get('Location'), '/activos/' + body.id);
    const get = await f.request('GET', '/activos/' + body.id, undefined, token);
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), body);
    const list = await (await f.request('GET', '/activos', undefined, token)).json();
    assert(esquema('activos', 'PaginaActivos')(list));
    assert.equal(list.total, 1);
});
test('GWT-HU02-02 RF-02: modificar ubicación, criticidad y uso conserva el estado', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const item = await (await f.request('POST', '/activos', nuevo, token)).json();
    const response = await f.request('PATCH', '/activos/' + item.id, { ubicacion: 'Planta B', criticidad: 'BAJA', uso_acumulado_horas: 12.5, marca: 'Andina', modelo: 'P-10' }, token);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert(esquema('activos', 'ActivoRespuesta')(body));
    assert.equal(body.ubicacion, 'Planta B');
    assert.equal(body.criticidad, 'BAJA');
    assert.equal(body.estado, 'OPERATIVO');
    assert.equal(body.uso_acumulado_horas, 12.5);
    assert.equal(body.marca, 'Andina');
    const invalid = await f.request('PATCH', '/activos/' + item.id, { estado: 'EN_FALLA' }, token);
    assert.equal(invalid.status, 400);
    const overflow = await fetch(f.url + '/activos/' + item.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: '{"uso_acumulado_horas":1e309}',
    });
    assert.equal(overflow.status, 400);
    assert.equal(f.datos.obtener(item.id).uso_acumulado_horas, 12.5);
});
test('GWT-HU02-03 RF-02: baja lógica conserva fila y oculta equipo de consultas', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const item = await (await f.request('POST', '/activos', nuevo, token)).json();
    const response = await f.request('DELETE', '/activos/' + item.id, undefined, token);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal((await f.request('GET', '/activos/' + item.id, undefined, token)).status, 404);
    const row = f.datos.db.prepare('SELECT * FROM activos WHERE id=?').get(item.id);
    assert(row);
    assert.equal(typeof row.deleted_at, 'string');
    assert.equal((await (await f.request('GET', '/activos', undefined, token)).json()).total, 0);
    assert.equal((await f.request('DELETE', '/activos/' + item.id, undefined, token)).status, 404);
    assert.equal((await f.request('PATCH', '/activos/' + item.id, { nombre: 'Otro' }, token)).status, 404);
});
test('GWT-HU02-04 RF-02: duplicado al crear devuelve 409; PATCH ignora el código', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    await f.request('POST', '/activos', nuevo, token);
    let response = await f.request('POST', '/activos', nuevo, token);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).codigo, 'CODIGO_DUPLICADO');
    const other = await (await f.request('POST', '/activos', { ...nuevo, codigo: 'EQ-0002' }, token)).json();
    response = await f.request('PATCH', '/activos/' + other.id, { codigo: 'formato-ignorado', nombre: 'Otra prensa' }, token);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).codigo, 'EQ-0002');
    response = await f.request('PATCH', '/activos/' + other.id, { codigo: null }, token);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).nombre, 'Otra prensa');
});
test('GWT-HU02-05 RF-02: código no se reutiliza después de baja', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const item = await (await f.request('POST', '/activos', nuevo, token)).json();
    await f.request('DELETE', '/activos/' + item.id, undefined, token);
    assert.equal((await f.request('POST', '/activos', nuevo, token)).status, 409);
});
test('GWT-HU02-06 RF-02: EQ exige cuatro dígitos exactos', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    for (const codigo of ['EQ-', 'EQ-ABC', 'EQ-123', 'EQ-12345', 'eq-0001', 'EQ-ABCD']) {
        const response = await f.request('POST', '/activos', { ...nuevo, codigo }, token);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).codigo, 'CODIGO_FORMATO_INVALIDO');
    }
});
test('GWT-HU02-07 RF-02: campos obligatorios, criticidad y propiedades extra se validan', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    for (const body of [{ codigo: 'EQ-0001', nombre: 'Prensa', criticidad: 'ALTA' }, { ...nuevo, ubicacion: '  ' }, { ...nuevo, criticidad: 'URGENTE' }, { ...nuevo, id: 50 }, { ...nuevo, eliminadoEn: null }, { ...nuevo, estado: 'ROTO' }]) {
        const response = await f.request('POST', '/activos', body, token);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).codigo, 'DATOS_INVALIDOS');
    }
});
for (const rol of ['TECNICO', 'TRABAJADOR', 'BODEGA', 'JEFATURA']) {
    test(`GWT-HU02-08 RF-01/RF-02/RNF-05: permisos de ${rol}`, async (t) => {
        const f = await fixture(t);
        const admin = await f.login();
        const item = await (await f.request('POST', '/activos', nuevo, admin)).json();
        const token = await f.login(rol);
        const lectura = rol === 'BODEGA' ? 403 : 200;
        assert.equal((await f.request('GET', '/activos', undefined, token)).status, lectura);
        assert.equal((await f.request('GET', '/activos/' + item.id, undefined, token)).status, lectura);
        for (const [method, path, body] of [['POST', '/activos', { ...nuevo, codigo: 'EQ-0002' }], ['PATCH', '/activos/' + item.id, { nombre: 'Otra' }], ['DELETE', '/activos/' + item.id, undefined]]) {
            const response = await f.request(method, path, body, token);
            if (rol === 'JEFATURA') assert.equal(response.status, { POST: 201, PATCH: 200, DELETE: 204 }[method]);
            else {
                assert.equal(response.status, 403);
                assert.equal((await response.json()).codigo, 'SIN_PERMISO');
            }
        }
        if (rol !== 'JEFATURA') assert.equal(f.datos.obtener(item.id).nombre, 'Prensa');
    });
}
test('GWT-HU02-09 RF-01/RF-02: las cinco rutas de activos exigen autenticación', async (t) => {
    const f = await fixture(t);
    for (const [method, path, body] of [['GET', '/activos', undefined], ['POST', '/activos', nuevo], ['GET', '/activos/1', undefined], ['PATCH', '/activos/1', { nombre: 'X' }], ['DELETE', '/activos/1', undefined]]) {
        const response = await f.request(method, path, body);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).codigo, 'NO_AUTORIZADO');
    }
});
test('GWT-HU02-10 RF-02: id, paginación y actualización vacía inválidos', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    for (const path of ['/activos/0', '/activos/no-numero', '/activos?page=0', '/activos?size=101', '/activos?page=-1', '/activos?size=NaN', '/activos?page=9007199254740991&size=100', '/activos?estado=ROTO', '/activos?extra=si'])
        assert.equal((await f.request('GET', path, undefined, token)).status, 400, path);
    assert.equal((await f.request('PATCH', '/activos/1', {}, token)).status, 400);
    assert.equal((await f.request('GET', '/activos/999', undefined, token)).status, 404);
});
test('GWT-HU02-11 RF-02: paginación estable con total independiente de página', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    for (let i = 1; i <= 3; i++)
        await f.request('POST', '/activos', { ...nuevo, codigo: 'EQ-000' + i }, token);
    const body = await (await f.request('GET', '/activos?page=2&size=1', undefined, token)).json();
    assert.equal(body.total, 3);
    assert.equal(body.page, 2);
    assert.equal(body.size, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].codigo, 'EQ-0002');
});
test('GWT-HU02-12 RF-02/RNF-06: operaciones registran actor y no guardan secretos', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const item = await (await f.request('POST', '/activos', nuevo, token)).json();
    await f.request('PATCH', '/activos/' + item.id, { nombre: 'Prensa actualizada' }, token);
    await f.request('DELETE', '/activos/' + item.id, undefined, token);
    await f.request('POST', '/auth/logout', undefined, token);
    const rows = f.datos.db.prepare('SELECT * FROM auditoria ORDER BY id').all();
    assert.deepEqual(rows.map(r => r.accion), ['LOGIN_CORRECTO', 'ACTIVO_CREADO', 'ACTIVO_MODIFICADO', 'ACTIVO_BAJA_LOGICA', 'LOGOUT']);
    assert(rows.every(r => r.actor_id === 1));
    assert(!JSON.stringify(rows).includes(token));
    assert(!JSON.stringify(rows).includes(PASSWORD));
});
test('GWT-HU02-13 RF-02: texto con caracteres SQL se almacena como dato', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const nombre = "Prensa'); DROP TABLE activos; --";
    const response = await f.request('POST', '/activos', { ...nuevo, nombre }, token);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).nombre, nombre);
    assert.equal(f.datos.listar({ page: 1, size: 20 }).total, 1);
});
test('GWT-HU02-14 RF-02: migra legado una vez, conserva IDs y persiste las bajas', async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'andina-persistencia-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'datos.sqlite');
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE equipos (id INTEGER PRIMARY KEY,codigo TEXT UNIQUE,nombre TEXT,ubicacion TEXT,
      criticidad TEXT,estado TEXT,creado_en TEXT,actualizado_en TEXT,eliminado_en TEXT);
      INSERT INTO equipos VALUES(7,'EQ-0007','Prensa','A','ALTA','OPERATIVO','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',NULL);
      INSERT INTO equipos VALUES(8,'EQ-0008','Motor','B','BAJA','OPERATIVO','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-02-01T00:00:00Z');`);
    legacy.close();
    let datos = new Datos(path);
    assert.equal(datos.obtener(7).codigo, 'EQ-0007');
    assert.equal(datos.obtener(7).uso_acumulado_horas, 0);
    assert.equal(datos.db.prepare('SELECT estado FROM activos WHERE id=8').get().estado, 'FUERA_DE_SERVICIO');
    const actor = datos.crearUsuario({ rut: ruts.SUPERVISOR, nombre: 'Supervisor', rol: 'SUPERVISOR', activo: true, passwordHash: await baseHash });
    datos.eliminar(7, actor.id, Date.now());
    datos.close();
    datos = new Datos(path);
    assert.equal(datos.listar({ page: 1, size: 20 }).total, 0);
    assert.equal(datos.db.prepare('SELECT count(*) AS n FROM activos').get().n, 2);
    assert.equal(datos.db.prepare('SELECT count(*) AS n FROM equipos').get().n, 2);
    assert.equal(datos.db.prepare('SELECT count(*) AS n FROM migraciones WHERE version = 1').get().n, 1);
    assert.throws(() => datos.crear({ ...nuevo, codigo: 'EQ-0008' }, actor.id, Date.now()), /reservado/);
    datos.close();
});
test('GWT-HU02-15 RF-02: JSON malformado se rechaza sin excepción expuesta', async (t) => {
    const f = await fixture(t);
    const token = await f.login();
    const response = await fetch(f.url + '/activos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{roto' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).codigo, 'DATOS_INVALIDOS');
});
