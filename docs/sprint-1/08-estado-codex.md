# Estado de Codex — Sprint 1

Actualizado: 12/11/2026. Alcance: HU-01 (3 SP) y HU-02 (5 SP). Repositorio confirmado: [SistemaAndinaSA](https://github.com/frduartey-collab/SistemaAndinaSA).

## Implementación disponible

- Contratos auth 0.2 y activos 0.1 definidos y validados antes de implementar sus handlers. Ocho operaciones HTTP con DTO en dominio.ts, TypeScript estricto y validación de entradas desde los schemas contractuales.
- Login con RUT módulo 11 y contraseña scrypt con sal; JWT firmado, sesión persistida como hash del token, expiración, revocación al cerrar sesión y consulta del rol/estado actual del usuario.
- RUT_INVALIDO, CREDENCIALES_INVALIDAS, USUARIO_INACTIVO y DEMASIADOS_INTENTOS implementados. DATOS_INVALIDOS y NO_AUTORIZADO añadidos al contrato.
- CRUD de equipos con identificación EQ-0000, nombre, ubicación, criticidad y estado; consultas paginadas, códigos únicos y baja lógica conservando fila y código. Escritura solo de SUPERVISOR, consultas de los cinco roles.
- SQLite con restricciones, consultas parametrizadas y transacciones de escritura/auditoría. Archivo 0600; no se registran contraseñas ni tokens en auditoría.
- Comandos de arranque y carga inicial por variables de entorno, sin cuentas ni secretos precargados. README, .env.example, lockfile y workflow de verificación.
- Modelo ER, 27 criterios GWT con RF y prueba asociados, tres wireframes SVG, trazabilidad, actas preparadas, auditoría final y backlog propuesto para Sprint 2.

## Verificación técnica

Entorno: Node.js 24.22.1, npm 11.9.0 y TypeScript 5.9.3.

| Comando / conjunto | Resultado |
| --- | --- |
| npm run validate:contracts | PASS, 8 operaciones; estructura, referencias, schemas y ejemplos |
| npm run build | PASS, sin errores TypeScript; también ejecutado por npm test |
| npm test | 35 passed, 0 failed, 0 skipped, 0 cancelled |
| HTTP / persistencia | 30 pruebas, incluidos cuatro roles de consulta parametrizados |
| Contratos | 4 pruebas |
| Comandos seed/start reales | 1 prueba con SQLite en disco y proceso servidor |

Resultados en [evidencias](evidencias/ejecucion.json). El validador adapta en memoria cuatro referencias del metaschema OAS para AJV; no soporta dialectos personalizados. Ver [VALIDACION.md](02-contratos-api/VALIDACION.md).

## Pendientes del cierre formal

- Peer review humano y firma del acta: pendientes.
- Ratificación del PO de D-01..D-07, aceptación de HU-01/HU-02 y firmas: pendientes. No se declaran 8 SP aceptados.
- No hay excepción firmada para omitir requisitos de la DoD.
- RNF de carga, disponibilidad, capacidad, móvil y despliegue: sin evidencia suficiente.
- Frontend ejecutable fuera del Sprint 1 según AGENTS.md. HU-03/HU-04/HU-05 quedan como backlog, sin endpoints implementados.

La [auditoría 09](09-auditoria-final.md) separa línea base, implementación y faltantes reales. Este archivo sustituye el estado anterior de cuatro tipos y ningún endpoint.
