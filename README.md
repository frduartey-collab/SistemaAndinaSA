# Manufacturas Andina: Sprint 1

Backend Node.js + Express + TypeScript estricto y SQLite. Alcance: HU-01 (RF-01, 3 SP) y HU-02 (RF-02, 5 SP). El frontend funcional está fuera del Sprint 1; se incluyen tres wireframes.

## Preparación local

Requiere Node.js 24.22.1 (rama 24) y npm. La conexión SQLite de esta iteración usa better-sqlite3, un componente nativo instalado por npm.

1. `npm ci` instala las dependencias y sus componentes nativos. No uses `--ignore-scripts` con better-sqlite3.
2. `cp .env.example .env`
3. Genera una clave con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y copia el resultado a JWT_SECRET en .env.
4. `npm run build` compila el backend.
5. `npm start` inicia en http://127.0.0.1:3000. `npm run dev` compila e inicia.

Al arrancar, el servidor ejecuta seed() de forma idempotente: crea el usuario SUPERVISOR de demostración con RUT **11111111-1** y contraseña **admin123**, solo si ese RUT no existe. Si ya existe, conserva contraseña, rol y demás datos; no restablece la cuenta.

La base por defecto es `backend/data/app.db`, abierta mediante db.ts y better-sqlite3. Para seguir usando la base de la versión anterior, define `DB_PATH=backend/data/andina.sqlite` en .env antes del arranque: así conservas usuarios, sesiones, activos y auditoría en el archivo existente.

`npm run seed` permite crear otros usuarios de demostración con SEED_RUT, SEED_PASSWORD y SEED_ROL opcionales en .env. Sus valores por defecto son 11111111-1, admin123 y SUPERVISOR; repetirlo no reemplaza un usuario existente. Los roles admitidos son SUPERVISOR, TECNICO, TRABAJADOR, BODEGA y JEFATURA. BODEGA puede autenticarse, pero no acceder a activos. No hay un endpoint de creación de usuarios en HU-01/HU-02.

**Credencial DEMO local:** 11111111-1 / admin123. Es una cuenta de desarrollo conocida; no representa una credencial de producción. JWT_SECRET permanece vacío en .env.example y debe configurarse. .env, claves y bases de datos quedan excluidos de Git.

## Verificación

- `npm run validate:contracts`: estructura OpenAPI, referencias y schemas.
- `npm run build`: TypeScript estricto.
- `npm test`: compila y ejecuta las pruebas existentes adaptadas y los casos esenciales de autenticación y activos con supertest, usando bases aisladas.

Los resultados y su fecha se registran en [el estado de implementación](docs/sprint-1/08-estado-codex.md).

## Endpoints y permisos

Envía el token del login en Authorization como Bearer seguido de un espacio y el token. Login devuelve token, usuario y expiraEn.

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | /auth/login | Público, RUT y contraseña |
| GET | /auth/me | Sesión válida |
| POST | /auth/logout | Sesión válida; revocación inmediata |
| GET | /activos | SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR |
| POST | /activos | SUPERVISOR y JEFATURA |
| GET | /activos/{id} | SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR |
| PATCH | /activos/{id} | SUPERVISOR y JEFATURA |
| DELETE | /activos/{id} | SUPERVISOR y JEFATURA, baja lógica |

BODEGA recibe 403 SIN_PERMISO en las cinco operaciones de activos. Una petición sin sesión válida recibe 401 NO_AUTORIZADO.

## Uso de activos

GET /activos admite q (subcadena literal en codigo o nombre), criticidad, estado, page (por defecto 1) y size (por defecto 20, máximo 100). Ejemplo: `/activos?q=Prensa&criticidad=ALTA&page=1&size=20`. Devuelve PaginaActivos con items, total, page y size; total aplica los mismos filtros que items. Los activos dados de baja se excluyen tanto de la lista como del detalle. El detalle inexistente o dado de baja devuelve 404 ACTIVO_NO_ENCONTRADO.

POST requiere codigo, nombre, ubicacion y criticidad. Marca y modelo son opcionales y admiten null. El servidor asigna estado OPERATIVO, uso_acumulado_horas 0 y fecha_alta. El código debe tener formato EQ-0000; otro formato da 400 CODIGO_FORMATO_INVALIDO. Un código ya reservado, incluso dado de baja, da 409 CODIGO_DUPLICADO.

PATCH modifica solo los campos presentes: nombre, marca, modelo, ubicacion, criticidad y uso_acumulado_horas (no negativo). Omitir conserva el valor; null vacía marca/modelo. Cualquier codigo recibido se ignora; una petición que solo contiene codigo responde 200 sin cambios. No permite editar estado, fecha_alta ni deleted_at. Las transiciones generales de estado corresponden a HU-04/HU-05, fuera de esta entrega.

DELETE conserva la fila y el código reservado: asigna deleted_at y fija estado FUERA_DE_SERVICIO. Las respuestas usan id, codigo, nombre, marca, modelo, ubicacion, criticidad, estado, uso_acumulado_horas, fecha_alta y deleted_at. Esquemas y ejemplos están en [los contratos](docs/sprint-1/02-contratos-api/).

## Persistencia y migración

La conexión better-sqlite3 se centraliza en db.ts; se conservan usuarios, sesiones, activos y sus campos. Los intentos de login usan intentos_login.origen como clave de RUT normalizado, en lugar de IP, sin perder la persistencia al reiniciar.

La tabla de trabajo es activos. Al abrir una base de la versión anterior, una migración transaccional de una sola ejecución copia equipos conservando IDs, códigos y fechas de alta/baja. Los registros dados de baja se copian con FUERA_DE_SERVICIO; marca/modelo parten en null y uso_acumulado_horas en 0. La tabla equipos se conserva como legado y no se usa en las rutas nuevas. El registro de migración evita reimportar datos en cada arranque. Se reutilizan la conexión SQLite, usuarios, sesiones y auditoría.

## Seguridad y decisiones

- Acceso a activos según la matriz solicitada por el usuario el 12/11/2026; sustituye la política anterior de SUPERVISOR único escritor y cinco roles lectores.
- Código EQ- y cuatro dígitos, inmutable y único incluso tras la baja.
- Cinco intentos de login fallidos por RUT normalizado reciben 401 dentro de una ventana de cinco minutos. El siguiente intento recibe 429 DEMASIADOS_INTENTOS con Retry-After; otro RUT mantiene un contador independiente. Los contadores persisten en SQLite.
- JWT HS256 firmado con jsonwebtoken, vigente durante ocho horas (28800 segundos), con sesión persistida y revocable. Rol y estado del usuario se consultan en cada petición. Logout invalida el token de esa sesión, como exige el contrato; no se adopta logout stateless.
- Contraseñas nuevas con bcrypt, coste 12. El login conserva compatibilidad con hashes scrypt anteriores: tras autenticar una contraseña de hasta 72 bytes, actualiza su hash a bcrypt. Si la contraseña heredada supera 72 bytes, conserva scrypt para evitar truncamiento. SQLite en disco tiene permisos 0600.
- El token se guarda como SHA-256. La auditoría guarda actor, acción, entidad y fecha, sin contraseñas ni tokens legibles.

El servidor escucha en localhost y no confía en X-Forwarded-For. El despliegue requiere TLS, proxy confiable, operación de secretos, respaldo y mediciones RNF. Esta entrega local no acredita disponibilidad 99,5% ni 50 usuarios concurrentes.

## Documentación y cierre

- [Informe fuente](docs/referencias/Informe_del_sistema.pdf)
- [Auditoría y pendientes reales](docs/sprint-1/09-auditoria-final.md)
- [Criterios GWT](docs/sprint-1/04-criterios-gwt/)
- [Wireframes](docs/sprint-1/05-wireframes/README.md)
- [Trazabilidad](docs/sprint-1/06-trazabilidad/RF-HU-GWT.md)
- [Estado de implementación](docs/sprint-1/08-estado-codex.md)

Las actas son borradores sin firma. La aceptación del PO y el peer review humano siguen pendientes para el cierre formal del sprint.
