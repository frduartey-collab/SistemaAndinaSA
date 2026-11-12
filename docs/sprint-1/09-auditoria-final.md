# Auditoría final del Sprint 1

Fecha: 12/11/2026. HU-01 (3 SP) + HU-02 (5 SP) = 8 SP planificados.

**Implementación técnica verificada; cierre formal NO cumplido. FALTAN peer review humano, aceptación del PO y firmas.** Las actas son borradores y no acreditan 8 SP aceptados.

## Fuente, alcance y línea base

Repositorio confirmado por el usuario: [frduartey-collab/SistemaAndinaSA](https://github.com/frduartey-collab/SistemaAndinaSA). Base revisada: `9417b7c4b3c4326a1bd05980b27bdf824e940083`.

Fuente: [Informe del sistema](../referencias/Informe_del_sistema.pdf), §3.1/3.2 p.4, HU §5.1 p.5 y estimaciones §8.1 p.6. SHA-256 del original y la copia incluida: `d79ac35fe9931fd8ed2e125986c2c37751afd6bc7a44b69b531d75a57a225252`.

La solicitud inicial era solo auditar. La instrucción posterior «Implementa todas las funciones y archivos que necesite» autorizó implementar los faltantes del Sprint 1. Los resultados actuales no se atribuyen al commit inicial.

| Elemento | Línea base inicial | Tras implementación |
| --- | --- | --- |
| Build / dominio.ts | PASS, cuatro tipos; sin funcionalidad HTTP | PASS, DTO y ocho handlers en strict |
| npm test | Exit 1: Missing script: test; 0 pruebas ejecutadas | Exit 0: 35 passed, 0 failed |
| auth.openapi.yaml | Contrato documental 0.1 | 0.2 implementado y validado |
| activos.openapi.yaml | FALTA | Creado, implementado y validado |
| Rutas, autenticación y SQLite | FALTA | Ocho operaciones y persistencia |
| GWT, wireframes, trazabilidad, actas y auditoría | FALTA | Archivos preparados; firmas pendientes |

## Compilación y pruebas

Node.js 24.22.1, npm 11.9.0 y TypeScript 5.9.3. Dependencias fijadas en package-lock.json.

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| npm run build | OK, sin errores de TypeScript | [build.log](evidencias/build.log); también ejecutado por npm test |
| npm run validate:contracts | OK, 8 operaciones | [contratos.log](evidencias/contratos.log) |
| npm test | 35 passed, 0 failed, 0 skipped, 0 cancelled | [tests.log](evidencias/tests.log) |
| Versiones y fecha de ejecución | Registradas | [ejecucion.json](evidencias/ejecucion.json) |

Distribución: 30 pruebas HTTP/persistencia, 4 de coherencia contractual y 1 de comandos reales seed/start. Los 27 criterios GWT tienen pruebas; HU02-08 genera cuatro casos, uno por rol de consulta. No se omiten pruebas. La validación OAS adapta en memoria cuatro referencias del metaschema para AJV; no soporta dialectos personalizados. Ver [VALIDACION.md](02-contratos-api/VALIDACION.md).

## HU-01: contrato ↔ código

Contrato: [auth.openapi.yaml](02-contratos-api/auth.openapi.yaml). Handlers: backend/src/app.ts; RUT/hash: seguridad.ts; sesiones/intentos: datos.ts; validación de entradas desde contrato: validacion.ts.

| Endpoint | Existe en código | Errores coinciden | Observaciones |
| --- | --- | --- | --- |
| POST /auth/login | Sí, app.post | Sí: 400 RUT_INVALIDO / DATOS_INVALIDOS; 401 CREDENCIALES_INVALIDAS; 403 USUARIO_INACTIVO; 429 DEMASIADOS_INTENTOS | RUT módulo 11 y hash con sal. Quinto fallo por IP bloquea durante el resto de la ventana de 15 minutos; Retry-After. Éxito 200 con token/usuario/expiraEn. GWT HU01-01..05/09/10 |
| GET /auth/me | Sí, app.get | Sí: 401 NO_AUTORIZADO | Rechaza token ausente, manipulado, expirado o revocado y usuario inactivo. Devuelve perfil público actual. GWT HU01-01/07/08 |
| POST /auth/logout | Sí, app.post | Sí: 401 NO_AUTORIZADO | 204 vacío; revocación persistida. El token deja de permitir acceso; otras sesiones continúan. GWT HU01-06/11 |

Los cuatro errores exigidos inicialmente están implementados y ejercitados. Auth 0.2 declara además errores por cuerpo malformado y sesión inválida. La duración del JWT y el bloqueo concreto requieren ratificación del PO; el PDF no fija esos valores.

## HU-02: contrato ↔ código

Contrato: [activos.openapi.yaml](02-contratos-api/activos.openapi.yaml). Handlers: backend/src/app.ts. Persistencia/transacciones: datos.ts. Lectura de los cinco roles autenticados; escritura de SUPERVISOR. Otros roles reciben 403 SIN_PERMISO.

| Endpoint | Existe en código | Errores coinciden | Observaciones |
| --- | --- | --- | --- |
| GET /activos | Sí, app.get | Sí: 400 DATOS_INVALIDOS; 401 NO_AUTORIZADO | limit 1..100, offset >= 0; excluye bajas y devuelve items/total. GWT HU02-01/03/08..11 |
| POST /activos | Sí, app.post | Sí: 400 DATOS_INVALIDOS / CODIGO_INVALIDO; 401 NO_AUTORIZADO; 403 SIN_PERMISO; 409 CODIGO_DUPLICADO | 201 con Location. EQ- y cuatro dígitos; codigo, nombre, ubicacion y criticidad obligatorios. Estado por defecto OPERATIVO. GWT HU02-01/04..09/13/15 |
| GET /activos/{id} | Sí, app.get /activos/:id | Sí: 400 DATOS_INVALIDOS; 401 NO_AUTORIZADO; 404 EQUIPO_NO_ENCONTRADO | ID entero positivo seguro. Equipo dado de baja o inexistente: 404. GWT HU02-01/03/08..10 |
| PATCH /activos/{id} | Sí, app.patch /activos/:id | Sí: 400 DATOS_INVALIDOS / CODIGO_INVALIDO; 401 NO_AUTORIZADO; 403 SIN_PERMISO; 404 EQUIPO_NO_ENCONTRADO; 409 CODIGO_DUPLICADO | Actualización parcial no vacía; no permite tomar código de otro equipo. GWT HU02-02/04/08..10 |
| DELETE /activos/{id} | Sí, app.delete /activos/:id | Sí: 400 DATOS_INVALIDOS; 401 NO_AUTORIZADO; 403 SIN_PERMISO; 404 EQUIPO_NO_ENCONTRADO | 204 vacío. UPDATE de eliminado_en/actualizado_en; conserva fila y reserva del código. No hay DELETE físico de equipos. GWT HU02-03/05/08..10/14 |

EQ-XXXX se concretó como `^EQ-[0-9]{4}$`; el PDF exige identificación pero no fija esos cuatro dígitos. La no reutilización de códigos y la matriz exacta de permisos constan en D-01..D-03, pendientes del PO. Escrituras y auditoría son transaccionales; HU02-12 comprueba actor y ausencia de secretos.

## RF cubiertos frente al PDF

OK = cubierto técnicamente en el backend del sprint. FALTA = implementación o evidencia ausente. DISCREPANCIA = diferencia de alcance o interpretación que requiere decisión explícita.

| RF / parte de §3.1 p.4 | Estado | Evidencia / límite |
| --- | --- | --- |
| RF-01: inicio de sesión con RUT y contraseña | OK | POST /auth/login, módulo 11, scrypt; HU01-01..05/09/10 |
| RF-01: permisos por rol | OK | Middleware en escrituras; HU02-08 prueba los cuatro roles sin escritura. Matriz exacta por ratificar |
| RF-01: cierre de sesión | OK | Revocación persistida; HU01-06/11 |
| RF-02: crear | OK | POST /activos; HU02-01/04..07 |
| RF-02: consultar | OK | GET lista/detalle; HU02-01/03/11 |
| RF-02: modificar | OK | PATCH /activos/{id}; HU02-02/04 |
| RF-02: eliminar | OK | Baja lógica conservando fila; HU02-03/05/14 |
| RF-02: identificación, ubicación y criticidad | OK | codigo/nombre/ubicacion/criticidad en contrato, DTO y SQLite; HU02-07 prueba campos obligatorios |
| RF-01/RF-02: aceptación del PO | FALTA | No hay validación firmada; no equivale a ausencia de backend |
| Frontend funcional | DISCREPANCIA de alcance explicitada | AGENTS.md lo excluye del Sprint 1. Hay tres wireframes; no se declara aplicación completa para usuarios finales |
| RF-03/RF-04/RF-05 | FALTA, previsto Sprint 2 | Sin endpoints de fallas, OT ni intervenciones |

## RNF de §3.2 p.4

| RNF | Estado | Evidencia o pendiente |
| --- | --- | --- |
| RNF-01: 95% operaciones <2 s | FALTA evidencia | Sin ensayo de carga; duración de tests no es percentil de producción |
| RNF-02: disponibilidad 99,5% | FALTA | Sin despliegue, monitorización ni medición |
| RNF-03: al menos 50 concurrentes | FALTA evidencia | Sin prueba de concurrencia representativa |
| RNF-04: 10.000 fallas/5.000 OT anuales y 100 GB adjuntos | FALTA | Funciones y plan de capacidad pendientes |
| RNF-05: acceso por rol | OK para HU-01/HU-02 | Middleware y pruebas 401/403; futuras historias pendientes |
| RNF-06: auditoría | OK en operaciones implementadas; parcial global | Actor/acción/entidad/fecha y transacciones; retención y acceso de revisión por acordar |
| RNF-07: hash con sal y acceso restringido | OK local para HU-01/HU-02; parcial en despliegue | scrypt, JWT, revocación y SQLite 0600; TLS/operación de secretos pendientes |
| RNF-08: integridad de registros cerrados | FALTA | OT/intervenciones fuera de Sprint 1 |
| RNF-09: usabilidad móvil | FALTA evidencia | Sin frontend ni pruebas con usuarios |
| RNF-10: identidad visual | FALTA validación | Wireframes de estructura, sin diseño visual aceptado |
| RNF-11: escalabilidad | FALTA evidencia | SQLite local no acredita capacidad objetivo |
| RNF-12: documentación técnica | OK para alcance local | README, contratos, ER, GWT, trazabilidad y comandos; despliegue futuro pendiente |

## Documentación y DoD

Rutas relativas a docs/sprint-1. Existencia de archivos no acredita firmas.

| Documento / condición | Existe | Estado |
| --- | --- | --- |
| 02-contratos-api/auth.openapi.yaml | Sí | Validación técnica OK, aceptación PO pendiente |
| 02-contratos-api/activos.openapi.yaml | Sí | Validación técnica OK, aceptación PO pendiente |
| Tipos compilando | Sí | strict, 0 errores TypeScript |
| 04-criterios-gwt/matriz-GWT-HU01.md | Sí | 12 criterios; cada fila cita RF-01 §3.1 p.4 y prueba |
| 04-criterios-gwt/matriz-GWT-HU02.md | Sí | 15 criterios; cada fila cita RF-02 §3.1 p.4 y prueba |
| 05-wireframes/01-login.svg | Sí | Propuesta; aceptación pendiente |
| 05-wireframes/02-catalogo-equipos.svg | Sí | Propuesta; aceptación pendiente |
| 05-wireframes/03-formulario-equipo.svg | Sí | Propuesta; aceptación pendiente |
| 06-trazabilidad/RF-HU-GWT.md | Sí | RF/HU/GWT/contrato/código/wireframe vinculados |
| 07-peer-review/acta-revision.md | Sí | **FALTA revisión humana y firma** |
| 00-acta-excepcion.md | Sí | **BORRADOR SIN FIRMA; no hay excepción aprobada** |
| 00b-acta-validacion-PO.md | Sí | **FALTA aceptación y firma del PO** |
| 03-modelo-datos/modelo-ER.md | Sí | Esquema implementado |
| 08-estado-codex.md | Sí | Actualizado |
| 09-auditoria-final.md | Sí | Este informe |
| 10-pendientes-sprint-2.md | Sí | Propuesta; capacidad por confirmar |

## Acciones necesarias y Sprint 2

Antes de cerrar Sprint 1: revisor humano debe revisar código/contratos/evidencias y firmar; PO debe ratificar D-01..D-07 y aceptar o rechazar HU-01/HU-02. El equipo debe completar y decidir si procede el acta de excepción. Estos faltantes no se trasladan silenciosamente a Sprint 2.

| Pendiente de Sprint 2 | Referencia | Trabajo por hacer |
| --- | --- | --- |
| HU-03, propuesta 5 SP | RF-03 | Reporte de falla, prioridad, hasta tres fotos y aviso al supervisor; contrato, GWT, implementación y pruebas |
| HU-04, propuesta 8 SP | RF-04 | OT desde falla, técnicos, fecha límite y estados; contrato, transiciones y pruebas |
| HU-05, propuesta 8 SP | RF-05 | Diagnóstico, tiempos, solución, repuestos y cierre; integridad y pruebas |

Detalle en [10-pendientes-sprint-2.md](10-pendientes-sprint-2.md). Los 21 SP son propuesta pendiente de capacidad y aprobación. Los RNF faltantes requieren planificación y evidencia.
