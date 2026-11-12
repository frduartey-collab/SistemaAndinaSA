# Alcance y decisiones del Sprint 1

Actualizado: 12/11/2026. HU-01 (3 SP) + HU-02 (5 SP) = 8 SP planificados. Fuente: informe §3.1/3.2 p.4, historias §5.1 p.5 y estimación §8.1 p.6.

## Instrucciones de esta iteración

La solicitud inicial era una auditoría. La instrucción posterior «Implementa todas las funciones y archivos que necesite» autorizó la implementación del Sprint 1. Después el usuario concretó HU-02 con nuevos campos, filtros, roles, códigos de error y comportamiento de PATCH/DELETE, y pidió verificación acotada seguida de commit y push. Esa instrucción sustituye las decisiones anteriores que resulten incompatibles.

HU-03, HU-04 y HU-05 siguen como backlog de Sprint 2. No se implementan transiciones generales de estado ni endpoints de fallas, OT o intervenciones. El frontend ejecutable sigue fuera de Sprint 1 según AGENTS.md.

## Decisiones vigentes

| ID | Regla vigente | Fuente / estado |
| --- | --- | --- |
| D-01 | SUPERVISOR y JEFATURA escriben; TECNICO y TRABAJADOR leen; BODEGA no accede a activos | Fijada por la nueva instrucción del usuario; sustituye la matriz anterior |
| D-02 | Código EQ- y cuatro dígitos; se ignora cualquier codigo recibido en PATCH | Fijada por la nueva instrucción; codigo-only responde 200 sin cambios |
| D-03 | Baja lógica: deleted_at y FUERA_DE_SERVICIO; código reservado incluso tras la baja | Fijada por la nueva instrucción; nunca DELETE físico |
| D-04 | Quinto fallo de login por IP bloquea en ventana de 15 minutos | Decisión de autenticación pendiente de ratificación formal |
| D-05 | JWT HS256, 60 minutos y revocación persistida | Decisión de autenticación pendiente de ratificación formal |
| D-06 | SQLite local y API en localhost | Stack de avance en AGENTS.md; no acredita despliegue productivo |
| D-07 | Wireframes de login, catálogo y formulario; sin frontend ejecutable | Alcance Sprint 1 de AGENTS.md |
| D-08 | Tabla activos, filtros q/criticidad/estado y page/size; marca/modelo opcionales, uso inicial 0, estado inicial OPERATIVO | Nueva especificación HU-02; estado/fechas no editables por PATCH |

El contrato activos 0.2 recoge estas reglas antes de sus handlers. Auth 0.2 conserva los cuatro errores de login e incluye DATOS_INVALIDOS y NO_AUTORIZADO. Las reglas de negocio solicitadas no equivalen a una aceptación firmada del sprint.

## Compatibilidad de datos

La migración de equipos a activos es transaccional y de una sola ejecución. Conserva IDs, códigos y bajas; mantiene equipos como legado sin reimportarlo en futuros arranques. Los datos dados de baja se copian como FUERA_DE_SERVICIO. La auditoría conserva sus identificadores históricos. Marca/modelo nuevos parten en null y uso_acumulado_horas en 0.

Las firmas del PO, el peer review humano y las mediciones RNF pendientes no se dan por completados mediante esta instrucción de implementación.
