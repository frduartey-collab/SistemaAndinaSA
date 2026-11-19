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

Peer review humano, aceptación del PO y firmas siguen pendientes; las actas son borradores SIN FIRMA. No se declaran 8 SP aceptados ni RNF productivos acreditados. HU-05 permanece como backlog de Sprint 2.

## Frontend · etapa de interfaz completada

La carpeta frontend contiene la interfaz React de HU-01 y HU-02. El login usa RUT y contraseña. El contexto comprueba la sesión al recargar, controla el vencimiento y revoca el token al cerrar sesión. El catálogo aplica la matriz vigente de permisos, muestra 20 equipos por página y permite buscar por código o nombre y filtrar por criticidad y estado.

La ficha consulta el activo por ID. El formulario crea y edita mediante la API, conserva el código al editar y muestra los errores sin perder los datos escritos. Si la sesión vence mientras el usuario prepara cambios, puede recuperar el borrador en la misma pestaña al volver a ingresar con la misma cuenta. La confirmación de baja muestra el código y el nombre y explica que ese código sigue reservado.

Verificación local: npm run build del frontend y validación de los dos contratos OpenAPI. En Chromium, con una base SQLite temporal, se comprobó la redirección sin sesión, el login, los filtros y paginación, el detalle, la creación, el código duplicado, la edición, la recuperación del borrador tras revocar una sesión, la baja y el cierre de sesión. Se verificaron los cinco roles y el ancho móvil de 390 px. La API se ejecuta en localhost:3000 y el frontend en localhost:5173.

## Registro de usuarios y reporte de fallas (avance HU-03)

POST /auth/register guarda una cuenta activa con RUT único y hash bcrypt. El alta pública admite Técnico y Trabajador. Supervisor y Jefatura pueden crear cuentas de Bodega con su sesión. Jefatura puede asignar roles administrativos. El alta pública redirige al login y el alta administrativa confirma la creación dentro de la sesión vigente.

POST /fallas guarda el equipo vigente, autor de la sesión, descripción, prioridad, estado Reportada y fecha. Si no se envía prioridad, toma la criticidad actual del equipo. GET /fallas devuelve resultados paginados. Supervisor/Jefatura ven todos los reportes, Técnico/Trabajador ven los propios y Bodega recibe 403. La pantalla Fallas incluye buscador, sugerencia editable y reintento de guardado con los datos conservados.

Las fotografías son una selección simulada de hasta tres imágenes. La carga real y el aviso automático al supervisor siguen pendientes. HU-05 queda para otra entrega.

Validación de esta entrega: 11 operaciones en tres contratos OpenAPI, 48 pruebas HTTP/de integración aprobadas y compilación de backend y frontend. La verificación de navegador usó SQLite en memoria y datos sintéticos.

## RUT compartido y órdenes de trabajo (HU-04)

El formulario de Registro y el backend reutilizan el Módulo 11 de backend/src/rut.ts. Al registrar, el navegador comprueba el dígito verificador antes del envío y el servidor vuelve a validarlo.

SQLite crea ordenes_trabajo con falla_id único y referencias a fallas y usuarios. Supervisor y Jefatura crean órdenes desde fallas sin asignación de equipos vigentes y eligen un técnico activo. La fecha límite se interpreta como fecha civil de Chile. GET /ordenes devuelve todas las órdenes para esos administradores y solo asignaciones propias para Técnico. Trabajador y Bodega reciben 403. GET /ordenes/tecnicos ofrece opciones paginadas para administradores sin exponer el RUT.

PATCH /ordenes/{id}/estado permite avanzar PENDIENTE → EN_PROGRESO → CERRADA al técnico asignado o a un administrador. La creación y los cambios se registran en auditoría. El cierre de estado funciona en HU-04 y el registro de intervenciones y repuestos sigue pendiente en HU-05.

Verificación local: 15 operaciones validadas en cuatro contratos OpenAPI, 52 pruebas aprobadas y compilaciones del backend y frontend correctas. Chromium verificó el RUT inválido antes del envío, la asignación desde Fallas, la conservación de campos si falla la red, las órdenes propias del técnico, el cierre con confirmación y la vista móvil de 390 px.

## Identidad visual de SIGEM

La interfaz de Manufacturas Andina incorpora el nombre SIGEM, una llave pixelada y una paleta azul marino y cian inspiradas en la referencia visual. La navegación distingue Equipos, Fallas, Órdenes y Crear cuenta por su ícono y su etiqueta. Las acciones de búsqueda, edición, baja, asignación, fotografías y sesión usan el mismo conjunto de pictogramas. Los diálogos devuelven el foco al control de origen al cerrarse.

El engranaje de Ajustes permite cambiar el tamaño del texto y la densidad del catálogo. El navegador guarda ambas preferencias de la interfaz localmente. El favicon, el manifiesto y los PNG para accesos directos están en el frontend. El ícono de inventario está disponible como recurso gráfico para una próxima etapa.

Validación en Chromium con SQLite en memoria. Se verificaron el login y el registro, los íconos y los tamaños del manifiesto, los ajustes al recargar, el manejo del diálogo con teclado y el catálogo a 390 px. Se recorrieron los flujos de asignación y cambio de estado de órdenes con Supervisor y Técnico, y el acceso restringido de Trabajador.

## Inicio y acceso diferenciados para Trabajador y Técnico

Trabajador inicia en Mi inicio con acceso a Reportar nueva falla y hasta cinco reportes propios, del más reciente al más antiguo. Puede consultar equipos en modo lectura y acceder a Mis reportes. El menú oculta Órdenes y una visita directa a esa ruta redirige a Fallas.

Técnico inicia en Órdenes de trabajo pendientes, que incluye sus asignaciones pendientes y en progreso. Puede avanzar sus estados y consultar también sus órdenes cerradas desde Ver todas mis órdenes. GET /ordenes admite el filtro opcional solo_abiertas, aplicado antes de la paginación. Los controles existentes de HU-04 rechazan las operaciones de Trabajador con 403 SIN_PERMISO e impiden asignarle una orden.

Validación. Los cuatro contratos OpenAPI validaron 15 operaciones. Pasaron 53 pruebas de backend y la compilación de React. Chromium verificó el inicio, el menú, la ruta directa y el flujo de cierre por rol con SQLite en memoria.

## Registro de intervenciones (HU-05)

El técnico asignado usa el formulario de cierre en una orden en progreso para registrar diagnóstico, solución, minutos y repuestos opcionales en texto libre. PUT /ordenes/{id}/cierre guarda una intervención por orden y registra el cierre y la auditoría en la misma transacción. Un reintento con los mismos datos devuelve el registro existente. Si los datos difieren, la API devuelve 409 y conserva la intervención original.

GET /ordenes/{id} devuelve el detalle para el técnico asignado, Supervisor y Jefatura. Después del cierre, la interfaz abre el resumen de solo lectura. Las órdenes históricas siguen visibles y muestran que se cerraron antes del registro de intervenciones. SQLite protege las órdenes cerradas y sus intervenciones contra edición y borrado. PATCH /ordenes/{id}/estado conserva el paso a EN_PROGRESO. Los repuestos quedan documentados para la futura integración con Inventario.

Pasaron 57 pruebas de backend y la compilación de React. La validación cubrió 17 operaciones OpenAPI y el flujo en Chromium usó SQLite en memoria. Se verificaron la recuperación de un error de red, el bloqueo de otro envío, la consulta del cierre con permisos y la visualización de una orden histórica.

## Landing comercial de SIGEM

La ruta pública / presenta Particular a $54.990 CLP al mes, con hasta 50 equipos, una sede, tres cuentas y activación sin costo. Empresa presenta $600.000 CLP al mes y $2.500.000 CLP por única vez para la puesta en marcha. Los valores se muestran antes de impuestos y las capacidades futuras aparecen como En desarrollo.

Seleccionar plan abre un resumen con acceso a /login. La contratación y los pagos corresponden a una etapa posterior. El inicio protegido pasa a /inicio y conserva los destinos por rol. Se verificaron la compilación del frontend, la selección en Chromium a 390 px y el ingreso de Trabajador y Técnico.

## Inventario de bodega y consumo de repuestos

Bodega y Jefatura pueden crear y editar repuestos, gestionar entradas y salidas, y dar de baja fichas sin stock. Técnico puede consultar repuestos para sus intervenciones. El stock actual cambia mediante movimientos y las existencias por debajo del mínimo se indican en el catálogo.

Al cerrar una orden, el técnico puede indicar los repuestos y cantidades utilizados. La transacción de SQLite registra la intervención, los movimientos, el consumo en orden_repuesto y el estado CERRADA. El cierre con existencias insuficientes devuelve 400 STOCK_INSUFICIENTE y revierte todas las escrituras. Una repetición idéntica devuelve el cierre guardado. El resumen conserva el nombre y código registrados al cerrar y las notas de intervenciones anteriores.

El contrato de repuestos describe el catálogo, la baja lógica y los movimientos. El contrato de órdenes define los consumos del cierre. El [plan de Inventario](../plans/2026-11-19-inventario-bodega.md) documenta las reglas y los casos verificados.

Pasaron 61 pruebas de backend y validaron 23 operaciones OpenAPI. La compilación del frontend pasó. Chromium comprobó el alta y los movimientos con Bodega, el aviso de stock bajo, el rechazo y reintento tras reponer existencias, el detalle del consumo y el bloqueo del reenvío manual cuando no se pudo confirmar un movimiento.

## Fotografías y avisos de fallas (HU-03)

El reporte permite adjuntar hasta tres imágenes JPEG, PNG o WebP de 5 MiB cada una. La API valida tipo, firma y tamaño. SQLite guarda la falla, las fotografías y los avisos en la misma transacción. El autor, Supervisor y Jefatura pueden consultar la fotografía dentro del alcance de acceso de Fallas.

Supervisor y Jefatura disponen de Avisos para consultar las fallas nuevas, marcar avisos como leídos por cuenta y abrir el reporte. Chromium comprobó el adjunto y su visualización, la conservación del formulario ante un fallo de red, la llegada del aviso y la persistencia de la lectura.
