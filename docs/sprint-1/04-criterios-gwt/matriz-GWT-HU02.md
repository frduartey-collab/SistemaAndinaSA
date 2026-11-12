# Matriz GWT HU02

Fuente de todos los criterios: RF-02, informe §3.1 p.4, [PDF fuente](../../referencias/Informe_del_sistema.pdf), concretado por la instrucción HU-02 del usuario de 12/11/2026 y el contrato activos 0.2. RNF-05/06/07 en §3.2 p.4 sustentan permisos, auditoría y acceso. Las reglas vigentes están en D-01..D-08; la aceptación formal sigue pendiente.

| Criterio | RF / fuente | Given (Dado) | When (Cuando) | Then (Entonces) | Prueba |
| --- | --- | --- | --- | --- | --- |
| GWT-HU02-01 | RF-02 §3.1 p.4 | Supervisor autenticado y activo válido | Crea, lista y consulta | 201 con Location; incluye ubicación/criticidad; estado inicial OPERATIVO y uso 0 | backend/tests/sprint1.test.mjs: GWT-HU02-01 |
| GWT-HU02-02 | RF-02 §3.1 p.4 | Activo existente | Modifica ubicación, criticidad o metadatos permitidos | 200; solo campos presentes cambian; no se habilitan transiciones de estado | backend/tests/sprint1.test.mjs: GWT-HU02-02 |
| GWT-HU02-03 | RF-02 §3.1 p.4 | Activo existente | Da de baja | 204; conserva fila, asigna deleted_at y FUERA_DE_SERVICIO; lista/detalle lo excluyen | backend/tests/sprint1.test.mjs: GWT-HU02-03 |
| GWT-HU02-04 | RF-02 §3.1 p.4 | Código reservado y otro activo existente | Intenta crear código duplicado y luego envía codigo en PATCH | POST devuelve 409 CODIGO_DUPLICADO; PATCH ignora codigo y conserva el original | backend/tests/sprint1.test.mjs: GWT-HU02-04 |
| GWT-HU02-05 | RF-02 §3.1 p.4 | Código de activo dado de baja | Intenta reutilizarlo | 409 CODIGO_DUPLICADO; la reserva se conserva | backend/tests/sprint1.test.mjs: GWT-HU02-05 |
| GWT-HU02-06 | RF-02 §3.1 p.4 | Código distinto de EQ- y cuatro dígitos | Intenta crear | 400 CODIGO_FORMATO_INVALIDO | backend/tests/sprint1.test.mjs: GWT-HU02-06 |
| GWT-HU02-07 | RF-02 §3.1 p.4 | Falta ubicación o hay criticidad/campos inválidos | Intenta crear o modificar | 400 DATOS_INVALIDOS; estado/fechas no son editables | backend/tests/sprint1.test.mjs: GWT-HU02-07 |
| GWT-HU02-08 | RF-02 §3.1 p.4 | Sesión de cada rol | Consulta y luego intenta escribir | SUPERVISOR/JEFATURA pueden escribir; TECNICO/TRABAJADOR solo leen; BODEGA recibe 403 SIN_PERMISO en ambas consultas y escrituras | backend/tests/sprint1.test.mjs: GWT-HU02-08 |
| GWT-HU02-09 | RF-02 §3.1 p.4 | Petición sin sesión válida | Accede a cualquiera de las cinco rutas | 401 NO_AUTORIZADO | backend/tests/sprint1.test.mjs: GWT-HU02-09 |
| GWT-HU02-10 | RF-02 §3.1 p.4 | ID, filtros o paginación inválidos, o PATCH vacío | Solicita la operación | 400; ID válido inexistente devuelve 404 ACTIVO_NO_ENCONTRADO | backend/tests/sprint1.test.mjs: GWT-HU02-10 |
| GWT-HU02-11 | RF-02 §3.1 p.4 | Tres activos consultables | Consulta page=2 y size=1 | Una fila en orden estable; total=3, page=2 y size=1 | backend/tests/sprint1.test.mjs: GWT-HU02-11 |
| GWT-HU02-12 | RF-02 §3.1 p.4 | Usuario autenticado | Crea, modifica, elimina y cierra sesión | Auditoría con actor y acciones, sin contraseñas ni tokens | backend/tests/sprint1.test.mjs: GWT-HU02-12 |
| GWT-HU02-13 | RF-02 §3.1 p.4 | Nombre con caracteres SQL | Crea activo | Se guarda como texto y la tabla permanece | backend/tests/sprint1.test.mjs: GWT-HU02-13 |
| GWT-HU02-14 | RF-02 §3.1 p.4 | Base anterior con equipos y bajas | Migra, da de baja y reabre conexión | Conserva IDs, códigos y bajas; aplica la migración solo una vez; no reaparece en catálogo | backend/tests/sprint1.test.mjs: GWT-HU02-14 |
| GWT-HU02-15 | RF-02 §3.1 p.4 | Petición con JSON malformado | API intenta parsearla | 400 DATOS_INVALIDOS sin detalles de excepción | backend/tests/sprint1.test.mjs: GWT-HU02-15 |

Se conservan los IDs para mantener trazabilidad al adaptar las pruebas existentes. Los cinco casos esenciales adicionales con supertest cubren creación por SUPERVISOR, duplicado, intento de escritura de TECNICO, búsqueda q y baja con FUERA_DE_SERVICIO. Los resultados ejecutados constan en 08-estado-codex.md y sus evidencias; esta matriz no acredita por sí sola un resultado ni la firma del PO.
