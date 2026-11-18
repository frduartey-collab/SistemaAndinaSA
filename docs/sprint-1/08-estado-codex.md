# Estado de Codex — Sprint 1

Actualizado: 12/11/2026. HU-01 y HU-02. Repositorio: SistemaAndinaSA; rama codex/sprint-1-hu01-hu02-20261112. Esta actualización aplica la nueva especificación de autenticación sobre la gestión de activos ya implementada.

## HU-01 implementada

| Endpoint | Comportamiento y contrato |
| --- | --- |
| POST /auth/login | RUT con formato chileno y módulo 11; bcrypt.compare; JWT jsonwebtoken HS256 de 8 h (expiraEn=28800); devuelve exactamente token, usuario y expiraEn |
| GET /auth/me | Authorization Bearer, firma/algoritmo/emisor/audiencia/expiración y sesión; devuelve UsuarioSesion actual (id, rut, nombre, rol, activo); 401 sin token válido |
| POST /auth/logout | 204 sin cuerpo; revoca la sesión persistida para cumplir el YAML, sin afectar otras sesiones |

Errores implementados: 400 RUT_INVALIDO, 401 CREDENCIALES_INVALIDAS, 403 USUARIO_INACTIVO, 429 DEMASIADOS_INTENTOS; DATOS_INVALIDOS y NO_AUTORIZADO ya forman parte del contrato. Cinco intentos fallidos por RUT normalizado se permiten en cinco minutos; el siguiente intento se bloquea con 429 y Retry-After. Otro RUT tiene un contador independiente. Se reutiliza la tabla intentos_login como persistencia del límite, opción compatible con el avance solicitado.

## Persistencia y seed

- backend/src/db.ts abre SQLite mediante better-sqlite3 y crea usuarios con id, rut, nombre, password_hash, rol y activo.
- Base por defecto: backend/data/app.db. DB_PATH permite otra ruta. Para reutilizar la base anterior conservar DB_PATH=backend/data/andina.sqlite (o su ruta absoluta); el cambio de nombre por defecto no mueve ni borra archivos.
- seed() idempotente inserta SUPERVISOR, RUT 11111111-1, contraseña admin123, solo si no existe. La contraseña de demostración se almacena como hash bcrypt de coste 12; no se sobrescriben hash, rol ni estado de un usuario existente. El servidor invoca el seed inicial al arrancar.
- npm run seed permite SEED_RUT/SEED_PASSWORD/SEED_ROL para otros usuarios de desarrollo; repetirlo no cambia usuarios existentes.
- Todas las altas usan bcrypt. Los hashes scrypt existentes se verifican por compatibilidad y se actualizan a bcrypt al login correcto cuando la contraseña tiene hasta 72 bytes. Los legados más largos mantienen su hash para evitar truncamiento; los hashes nuevos rechazan más de 72 bytes.
- JWT firmado con jsonwebtoken, HS256 explícito y 28800 s de duración. Se conserva revocación persistida porque auth.openapi.yaml exige invalidar el token al cerrar sesión. La alternativa stateless del prompt era condicional; el comentario del handler explica esta decisión.
- HU-02 mantiene sus cinco rutas, campos, roles, filtros/paginación, auditoría y baja lógica sin transiciones generales de estado.

## Verificación

Node.js 24.22.1, npm 11.9.0, TypeScript 5.9.3. Dependencias y tipos fijados en el lockfile; npm ci con scripts nativos habilitados. strict=true y sin any explícito en los archivos TypeScript.

| Verificación | Resultado |
| --- | --- |
| Instalación limpia npm ci | PASS, incluidas dependencias nativas |
| npm run build | PASS, sin errores TypeScript; también ejecutado por npm test |
| npm run validate:contracts | PASS, tres operaciones auth y cinco de activos |
| Cuatro casos nuevos Supertest auth | PASS: login/token válido, credencial incorrecta, /auth/me con token y /auth/me sin token |
| npm test completo | 44 passed, 0 failed, 0 skipped, 0 cancelled |
| Login real → /auth/me | Verificado por Supertest a través de HTTP; la prueba CLI comprueba arranque y login con SQLite en disco |

Se conservaron las 40 pruebas previas, adaptadas a bcrypt, better-sqlite3 y al nuevo límite por RUT; se agregaron solo las cuatro solicitadas. El total de cuatro del prompt corresponde al módulo nuevo, no a eliminar la regresión existente. Evidencia actual: [ejecucion.json](evidencias/hu01-actualizacion/ejecucion.json), [tests.log](evidencias/hu01-actualizacion/tests.log), [contratos.log](evidencias/hu01-actualizacion/contratos.log).

**Desviaciones del contrato HTTP: cero.** No se agregaron endpoints ni campos de respuesta. Se conserva módulo 11 y logout revocable conforme al YAML existente. Su descripción aclara las políticas actuales; schemas, rutas y errores públicos se mantienen.

## Pendientes de cierre formal

Peer review humano, aceptación del PO y firmas siguen pendientes; las actas son borradores SIN FIRMA. No se declaran 8 SP aceptados ni RNF productivos acreditados. HU-04 y HU-05 permanecen como backlog de Sprint 2.

## Frontend · etapa de interfaz completada

La carpeta frontend contiene la interfaz React de HU-01 y HU-02. El login usa RUT y contraseña. El contexto comprueba la sesión al recargar, controla el vencimiento y revoca el token al cerrar sesión. El catálogo aplica la matriz vigente de permisos, muestra 20 equipos por página y permite buscar por código o nombre y filtrar por criticidad y estado.

La ficha consulta el activo por ID. El formulario crea y edita mediante la API, conserva el código al editar y muestra los errores sin perder los datos escritos. Si la sesión vence mientras el usuario prepara cambios, puede recuperar el borrador en la misma pestaña al volver a ingresar con la misma cuenta. La confirmación de baja muestra el código y el nombre y explica que ese código sigue reservado.

Verificación local: npm run build del frontend y validación de los dos contratos OpenAPI. En Chromium, con una base SQLite temporal, se comprobó la redirección sin sesión, el login, los filtros y paginación, el detalle, la creación, el código duplicado, la edición, la recuperación del borrador tras revocar una sesión, la baja y el cierre de sesión. Se verificaron los cinco roles y el ancho móvil de 390 px. La API se ejecuta en localhost:3000 y el frontend en localhost:5173.

## Registro de usuarios y reporte de fallas (avance HU-03)

POST /auth/register guarda una cuenta activa con RUT único y hash bcrypt. El alta pública admite Técnico y Trabajador. Supervisor y Jefatura pueden crear cuentas de Bodega con su sesión. Jefatura puede asignar roles administrativos. El alta pública redirige al login y el alta administrativa confirma la creación dentro de la sesión vigente.

POST /fallas guarda el equipo vigente, autor de la sesión, descripción, prioridad, estado Reportada y fecha. Si no se envía prioridad, toma la criticidad actual del equipo. GET /fallas devuelve resultados paginados. Supervisor/Jefatura ven todos los reportes, Técnico/Trabajador ven los propios y Bodega recibe 403. La pantalla Fallas incluye buscador, sugerencia editable y reintento de guardado con los datos conservados.

Las fotografías son una selección simulada de hasta tres imágenes. La carga real y el aviso automático al supervisor siguen pendientes. HU-04 y HU-05 quedan para otra entrega.

Validación de esta entrega: 11 operaciones en tres contratos OpenAPI, 48 pruebas HTTP/de integración aprobadas y compilación de backend y frontend. La verificación de navegador usó SQLite en memoria y datos sintéticos.
