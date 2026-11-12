# Alcance y decisiones del Sprint 1

Actualizado: 12/11/2026. HU-01 (3 SP) + HU-02 (5 SP) = 8 SP planificados. Fuente: informe §3.1/3.2 p.4, historias §5.1 p.5 y estimación §8.1 p.6.

## Instrucciones de esta iteración

La solicitud inicial era una auditoría. La instrucción posterior «Implementa todas las funciones y archivos que necesite» autorizó la implementación del Sprint 1. Después el usuario concretó HU-02 con nuevos campos, filtros, roles, códigos de error y comportamiento de PATCH/DELETE, y pidió verificación acotada seguida de commit y push. Esa instrucción sustituyó las decisiones anteriores incompatibles. La nueva especificación de HU-01 usa better-sqlite3, bcrypt, jsonwebtoken y seed idempotente, y reemplaza la política de bloqueo por IP y el JWT de una hora.

HU-03, HU-04 y HU-05 siguen como backlog de Sprint 2. No se implementan transiciones generales de estado ni endpoints de fallas, OT o intervenciones. El frontend ejecutable sigue fuera de Sprint 1 según AGENTS.md.

## Decisiones vigentes

| ID | Regla vigente | Fuente / estado |
| --- | --- | --- |
| D-01 | SUPERVISOR y JEFATURA escriben; TECNICO y TRABAJADOR leen; BODEGA no accede a activos | Fijada por la nueva instrucción del usuario; sustituye la matriz anterior |
| D-02 | Código EQ- y cuatro dígitos; se ignora cualquier codigo recibido en PATCH | Fijada por la nueva instrucción; codigo-only responde 200 sin cambios |
| D-03 | Baja lógica: deleted_at y FUERA_DE_SERVICIO; código reservado incluso tras la baja | Fijada por la nueva instrucción; nunca DELETE físico |
| D-04 | Cinco fallos 401 por RUT normalizado en cinco minutos; el siguiente intento recibe 429 con Retry-After; contadores independientes y persistidos | Nueva especificación HU-01; sustituye el bloqueo por IP de 15 minutos |
| D-05 | JWT HS256 con jsonwebtoken, ocho horas (28800 s), sesión y revocación persistidas | Nueva vigencia HU-01; el contrato exige revocación real tras logout, por lo que no se adopta logout stateless |
| D-06 | better-sqlite3, conexión db.ts y backend/data/app.db por defecto; API en localhost | Nueva especificación HU-01, dentro del stack SQLite de AGENTS.md; no acredita despliegue productivo |
| D-07 | Wireframes de login, catálogo y formulario; sin frontend ejecutable | Alcance Sprint 1 de AGENTS.md |
| D-08 | Tabla activos, filtros q/criticidad/estado y page/size; marca/modelo opcionales, uso inicial 0, estado inicial OPERATIVO | Especificación HU-02 conservada; estado/fechas no editables por PATCH |
| D-09 | Hashes nuevos bcrypt de coste 12; compatibilidad y migración de scrypt al autenticar contraseñas de hasta 72 bytes | Nueva especificación HU-01; las contraseñas scrypt mayores conservan su hash para evitar truncamiento |
| D-10 | Seed idempotente de SUPERVISOR 11111111-1/admin123 al arrancar; CLI con SEED_* opcionales | Credencial DEMO local solicitada; no reemplaza usuarios existentes ni equivale a cuenta de producción |

El contrato activos 0.2 recoge estas reglas antes de sus handlers. El contrato de autenticación conserva los cuatro errores de login e incluye DATOS_INVALIDOS y NO_AUTORIZADO; exige módulo 11 además del formato de RUT y revocación tras logout. Las reglas de negocio solicitadas no equivalen a una aceptación firmada del sprint.

## Compatibilidad de datos

Se conservan tablas y campos de usuarios, sesiones y activos al cambiar el controlador SQLite. DB_PATH puede apuntar al archivo anterior backend/data/andina.sqlite; el nuevo valor por defecto backend/data/app.db no mueve ese archivo automáticamente. Los hashes scrypt se verifican y migran a bcrypt después de un login válido cuando la contraseña no supera 72 bytes. El usuario de seed existente no se modifica. intentos_login.origen se usa como clave del RUT normalizado y los límites persisten al reiniciar.

La migración de equipos a activos es transaccional y de una sola ejecución. Conserva IDs, códigos y bajas; mantiene equipos como legado sin reimportarlo en futuros arranques. Los datos dados de baja se copian como FUERA_DE_SERVICIO. La auditoría conserva sus identificadores históricos. Marca/modelo nuevos parten en null y uso_acumulado_horas en 0.

Las firmas del PO, el peer review humano y las mediciones RNF pendientes no se dan por completados mediante esta instrucción de implementación.
