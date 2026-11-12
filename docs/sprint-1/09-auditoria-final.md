# Auditoría del Sprint 1 — estado tras actualizar HU-02

Actualizado: 12/11/2026. HU-01 (3 SP) + HU-02 (5 SP) = 8 SP planificados. **Implementación técnica verificada; cierre formal pendiente de revisión humana, aceptación del PO y firmas.**

Fuente: [Informe del sistema](../referencias/Informe_del_sistema.pdf), §3.1/3.2 p.4, historias §5.1 p.5 y estimaciones §8.1 p.6. SHA-256 del PDF: d79ac35fe9931fd8ed2e125986c2c37751afd6bc7a44b69b531d75a57a225252. La nueva especificación del usuario concreta los campos, roles, filtros y errores de HU-02; las reglas incompatibles de activos 0.1 quedan sustituidas por activos 0.2.

## Línea base y verificación

Repositorio [SistemaAndinaSA](https://github.com/frduartey-collab/SistemaAndinaSA). En la base inicial 9417b7c el build pasaba, pero npm test fallaba por ausencia de script (0 pruebas ejecutadas) y no había handlers ni SQLite. La implementación anterior, commit 21cf085, tenía 35 pruebas. Esta actualización conserva esas pruebas adaptadas y agrega únicamente cinco casos esenciales de Supertest.

| Comando actual | Resultado | Evidencia |
| --- | --- | --- |
| npm run build | PASS; strict=true, 0 errores TypeScript | [build.log](evidencias/hu02-actualizacion/build.log) |
| npm run validate:contracts | PASS; ocho operaciones | [contratos.log](evidencias/hu02-actualizacion/contratos.log) |
| npm test | 40 passed, 0 failed, 0 skipped, 0 cancelled | [tests.log](evidencias/hu02-actualizacion/tests.log) |
| Entorno y fecha | Node 24.22.1, npm 11.9.0, TypeScript 5.9.3 | [ejecucion.json](evidencias/hu02-actualizacion/ejecucion.json) |

Son 35 pruebas funcionales HTTP/persistencia, cuatro de contratos y una de comandos seed/start. La validación del metaschema OAS tiene la adaptación y limitaciones documentadas en [VALIDACION.md](02-contratos-api/VALIDACION.md). Los resultados locales no acreditan disponibilidad ni carga productiva.

## Contrato ↔ código

Contratos [auth](02-contratos-api/auth.openapi.yaml) y [activos](02-contratos-api/activos.openapi.yaml), ambos 0.2. Rutas en backend/src/app.ts, persistencia en datos.ts y validación de entrada desde contrato en validacion.ts; DTO en dominio.ts. Los cuatro errores iniciales de login se conservan y están probados.

| Endpoint | Existe en código | Errores coinciden | Observaciones |
| --- | --- | --- | --- |
| POST /auth/login | Sí | Sí: 400 RUT_INVALIDO/DATOS_INVALIDOS, 401 CREDENCIALES_INVALIDAS, 403 USUARIO_INACTIVO, 429 DEMASIADOS_INTENTOS | RUT módulo 11, contraseña scrypt, JWT y sesión revocable |
| GET /auth/me | Sí | Sí: 401 NO_AUTORIZADO | Perfil actual sin contraseña/hash |
| POST /auth/logout | Sí | Sí: 401 NO_AUTORIZADO | 204 vacío y revocación persistida |
| GET /activos | Sí | Sí: 400 DATOS_INVALIDOS, 401 NO_AUTORIZADO, 403 SIN_PERMISO | q literal en código/nombre, criticidad/estado, page/size; mismo filtro para total/items; excluye deleted_at no nulo |
| GET /activos/{id} | Sí, /activos/:id | Sí: 400 DATOS_INVALIDOS, 401 NO_AUTORIZADO, 403 SIN_PERMISO, 404 ACTIVO_NO_ENCONTRADO | Inexistente o dado de baja responde 404 |
| POST /activos | Sí | Sí: 400 DATOS_INVALIDOS/CODIGO_FORMATO_INVALIDO, 401 NO_AUTORIZADO, 403 SIN_PERMISO, 409 CODIGO_DUPLICADO | SUPERVISOR/JEFATURA; 201; EQ-0000 único incluso tras baja; OPERATIVO/0 iniciales |
| PATCH /activos/{id} | Sí, /activos/:id | Sí: 400 DATOS_INVALIDOS, 401 NO_AUTORIZADO, 403 SIN_PERMISO, 404 ACTIVO_NO_ENCONTRADO | SUPERVISOR/JEFATURA; solo campos presentes, codigo ignorado, estado/fechas no editables |
| DELETE /activos/{id} | Sí, /activos/:id | Sí: 400 DATOS_INVALIDOS, 401 NO_AUTORIZADO, 403 SIN_PERMISO, 404 ACTIVO_NO_ENCONTRADO | UPDATE de deleted_at y FUERA_DE_SERVICIO; 204; no borra fila |

Lectura de activos: SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR. BODEGA sin acceso a ambas consultas ni escrituras (403). Se reutilizan usuarios, sesiones, conexión SQLite y JWT. No se implementan transiciones generales de estado.

La migración a activos preserva IDs, códigos, fechas y bajas; marca/modelo comienzan en null y uso en 0. La tabla equipos queda como legado, sin reimportarse tras registrar la migración. La prueba HU02-14 verifica migración única y persistencia. No se borran filas de equipos ni activos.

## Cobertura de requisitos

| RF / parte del PDF §3.1 p.4 | Estado | Evidencia / límite |
| --- | --- | --- |
| RF-01: login con RUT y contraseña | OK | Login y GWT HU01-01..05/09/10 |
| RF-01: permisos por rol | OK en alcance implementado | Matriz actual de activos y GWT HU02-08/09 |
| RF-01: cierre de sesión | OK | Revocación y GWT HU01-06/11 |
| RF-02: crear | OK | POST y errores de formato/duplicado |
| RF-02: consultar | OK | Lista filtrada y detalle |
| RF-02: modificar | OK | PATCH parcial con código inmutable |
| RF-02: eliminar | OK | Baja lógica con fecha/estado y fila conservada |
| RF-02: identificación, ubicación y criticidad | OK | Contrato, DTO y activos; se agregan marca/modelo/uso/fechas solicitados |
| Aceptación del PO y firmas | FALTA | Actas preparadas, no firmadas |
| Frontend funcional | DISCREPANCIA de alcance explicitada | AGENTS.md lo excluye del Sprint 1; existen tres wireframes |
| RF-03/RF-04/RF-05 | FALTA, Sprint 2 | Sin endpoints de fallas, OT o intervenciones |

## RNF del PDF §3.2 p.4

| RNF | Estado y límite |
| --- | --- |
| RNF-01, 95% <2 segundos | FALTA evidencia de carga; duración de tests no acredita este percentil |
| RNF-02, disponibilidad 99,5% | FALTA despliegue y medición |
| RNF-03, 50 concurrentes | FALTA prueba representativa |
| RNF-04, capacidad fallas/OT/adjuntos | FALTA implementación y plan de capacidad |
| RNF-05, roles | OK para HU-01/HU-02; futuras historias pendientes |
| RNF-06, auditoría | OK en operaciones implementadas; retención/acceso de revisión pendientes |
| RNF-07, hash con sal y acceso restringido | OK local; TLS y operación de secretos de despliegue pendientes |
| RNF-08, integridad de registros cerrados | FALTA; OT/intervenciones fuera de esta entrega |
| RNF-09, usabilidad móvil | FALTA evidencia con interfaz y usuarios |
| RNF-10, identidad visual | FALTA aceptación del diseño |
| RNF-11, escalabilidad | FALTA evidencia; SQLite local no acredita el objetivo |
| RNF-12, documentación técnica | OK para alcance local; despliegue futuro pendiente |

## Documentación y cierre

Rutas relativas a docs/sprint-1. La existencia de archivos no acredita aceptación ni firma.

| Documento / condición | Existe | Estado |
| --- | --- | --- |
| 02-contratos-api/auth.openapi.yaml y activos.openapi.yaml | Sí | Validación técnica OK |
| Tipos compilando | Sí | strict=true, sin any explícito, sin errores |
| 04-criterios-gwt/matriz-GWT-HU01.md | Sí | 12 criterios, cada fila con RF-01 §3.1 p.4 y prueba |
| 04-criterios-gwt/matriz-GWT-HU02.md | Sí | 15 criterios actualizados, cada fila con RF-02 §3.1 p.4 y prueba |
| 05-wireframes/01-login.svg | Sí | Propuesta, aceptación pendiente |
| 05-wireframes/02-catalogo-equipos.svg | Sí | Propuesta, aceptación pendiente |
| 05-wireframes/03-formulario-equipo.svg | Sí | Adaptado a campos nuevos, aceptación pendiente |
| 06-trazabilidad/RF-HU-GWT.md | Sí | Actualizada |
| 07-peer-review/acta-revision.md | Sí | BORRADOR; FALTA revisión humana y firma |
| 00-acta-excepcion.md | Sí | BORRADOR SIN FIRMA; no hay excepción aprobada |
| 00b-acta-validacion-PO.md | Sí | BORRADOR; FALTA aceptación/firma del PO |
| 03-modelo-datos/modelo-ER.md | Sí | Tabla activos y migración documentadas |
| 08-estado-codex.md | Sí | Actualizado con implementación y evidencias actuales |
| 09-auditoria-final.md | Sí | Este informe |
| 10-pendientes-sprint-2.md | Sí | Propuesta de alcance/capacidad por confirmar |

## Pendientes para Sprint 2

| HU | RF | Propuesta SP | Trabajo pendiente |
| --- | --- | --- | --- |
| HU-03 | RF-03 | 5 | Registro de falla, prioridad, hasta tres fotos y aviso al supervisor; contrato, implementación, GWT y pruebas |
| HU-04 | RF-04 | 8 | OT desde falla, técnicos, fechas y estados; contratos, transiciones y pruebas |
| HU-05 | RF-05 | 8 | Diagnóstico, tiempos, solución, repuestos y cierre; integridad y pruebas |

Los 21 SP son propuesta pendiente de capacidad y aprobación. Antes de cerrar Sprint 1 siguen pendientes peer review humano, aceptación del PO y firmas. No se declaran 8 SP aceptados; una revisión automatizada no sustituye esas decisiones.
