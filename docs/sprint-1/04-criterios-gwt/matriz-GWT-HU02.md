# Matriz GWT HU02

Fuente de TODOS los criterios: RF-02, informe §3.1 p.4, [PDF fuente](../../referencias/Informe_del_sistema.pdf). RNF-05/06/07 en §3.2 p.4 sustentan permisos, auditoría y hash. D-01..D-05 concretan políticas por ratificar con PO.

| Criterio | RF / fuente | Given (Dado) | When (Cuando) | Then (Entonces) | Prueba |
| --- | --- | --- | --- | --- | --- |
| GWT-HU02-01 | RF-02 §3.1 p.4 | Supervisor autenticado y equipo válido | Crea, lista y consulta | 201 con Location; GET incluye ubicación y criticidad | backend/tests/sprint1.test.mjs: GWT-HU02-01 |
| GWT-HU02-02 | RF-02 §3.1 p.4 | Equipo activo existente | Supervisor modifica ubicación, criticidad y estado | 200 y cambios persistidos | backend/tests/sprint1.test.mjs: GWT-HU02-02 |
| GWT-HU02-03 | RF-02 §3.1 p.4 | Equipo activo existente | Supervisor da de baja | 204; fila conservada; GET/GET lista lo excluyen | backend/tests/sprint1.test.mjs: GWT-HU02-03 |
| GWT-HU02-04 | RF-02 §3.1 p.4 | Código reservado | Crea otro equipo o modifica a ese código | 409 CODIGO_DUPLICADO | backend/tests/sprint1.test.mjs: GWT-HU02-04 |
| GWT-HU02-05 | RF-02 §3.1 p.4 | Código de equipo dado de baja | Intenta reutilizarlo | 409, la reserva se conserva | backend/tests/sprint1.test.mjs: GWT-HU02-05 |
| GWT-HU02-06 | RF-02 §3.1 p.4 | Código distinto de EQ- más cuatro dígitos | Intenta crear equipo | 400 CODIGO_INVALIDO | backend/tests/sprint1.test.mjs: GWT-HU02-06 |
| GWT-HU02-07 | RF-02 §3.1 p.4 | Falta ubicación o hay criticidad/estado/campos inválidos | Intenta crear equipo | 400 DATOS_INVALIDOS | backend/tests/sprint1.test.mjs: GWT-HU02-07 |
| GWT-HU02-08 | RF-02 §3.1 p.4 | Sesión de cada rol que no sea SUPERVISOR | Consulta y luego intenta escribir | Consultas 200; POST/PATCH/DELETE 403 SIN_PERMISO; sin cambios | backend/tests/sprint1.test.mjs: GWT-HU02-08 |
| GWT-HU02-09 | RF-02 §3.1 p.4 | Solicitud sin sesión | Accede a cualquiera de las cinco rutas | 401 NO_AUTORIZADO | backend/tests/sprint1.test.mjs: GWT-HU02-09 |
| GWT-HU02-10 | RF-02 §3.1 p.4 | ID o paginación inválidos o actualización vacía | Solicita la operación | 400; ID inexistente válido devuelve 404 | backend/tests/sprint1.test.mjs: GWT-HU02-10 |
| GWT-HU02-11 | RF-02 §3.1 p.4 | Tres equipos activos | Consulta limit=1 y offset=1 | Una fila estable y total=3 | backend/tests/sprint1.test.mjs: GWT-HU02-11 |
| GWT-HU02-12 | RF-02 §3.1 p.4 | Usuario autenticado | Crea, modifica, elimina y cierra sesión | Auditoría con actor y acciones, sin contraseñas ni tokens | backend/tests/sprint1.test.mjs: GWT-HU02-12 |
| GWT-HU02-13 | RF-02 §3.1 p.4 | Nombre que contiene caracteres SQL | Crea equipo | Se guarda como texto y la tabla permanece | backend/tests/sprint1.test.mjs: GWT-HU02-13 |
| GWT-HU02-14 | RF-02 §3.1 p.4 | Base en disco con un equipo dado de baja | Reabre conexión | Fila y fecha conservadas; no reaparece en catálogo | backend/tests/sprint1.test.mjs: GWT-HU02-14 |
| GWT-HU02-15 | RF-02 §3.1 p.4 | Petición de activos con JSON malformado | API intenta parsearla | 400 DATOS_INVALIDOS sin detalles de excepción | backend/tests/sprint1.test.mjs: GWT-HU02-15 |

Evidencia automatizada: cada ID aparece en el título de una prueba; HU02-08 se parametriza para los cuatro roles de consulta. Pendiente aceptación y firma del PO; ejecutar tests no firma una historia.
