# Trazabilidad RF - HU - GWT - contratos - código

Fuente: [Informe del sistema](../../referencias/Informe_del_sistema.pdf), §3.1/3.2 p.4, §5.1 p.5, §8.1 p.6. Las decisiones detalladas están en [01-alcance-y-decisiones](../01-alcance-y-decisiones.md).

| RF | HU / SP | Criterios GWT | Contrato | Implementación | Wireframe |
| --- | --- | --- | --- | --- | --- |
| RF-01: login, rol y logout | HU-01 / 3 | HU01-01..HU01-12 | auth.openapi.yaml, 3 operaciones | app.ts, seguridad.ts, datos.ts y dominio.ts | 01-login.svg |
| RF-02: crear, consultar, modificar, eliminar; identificación, ubicación, criticidad | HU-02 / 5 | HU02-01..HU02-15 | activos.openapi.yaml, 5 operaciones | app.ts, datos.ts, validacion.ts y dominio.ts | 02-catalogo-equipos.svg y 03-formulario-equipo.svg |
| RNF-05, roles | HU-01/HU-02 | HU01-08 y HU02-08/09 | Bearer, 401/403 | autenticado y supervisor en app.ts | Login y catálogo |
| RNF-06, auditoría | HU-02 | HU02-12 | Reglas de servicio | Tabla auditoria y transacciones | Consulta del catálogo |
| RNF-07, hash y acceso restringido | HU-01 | HU01-05/07/10/12 | Errores de acceso y Bearer | scrypt, JWT, revocación, SQLite 0600 | Login |
| RF-03 | HU-03 / propuesta 5 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |
| RF-04 | HU-04 / propuesta 8 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |
| RF-05 | HU-05 / propuesta 8 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |

Las matrices completas incluyen cada Given/When/Then y su RF. Los archivos se encuentran en 04-criterios-gwt; las pruebas ejecutables están en backend/tests/sprint1.test.mjs y contracts.test.mjs. Esta matriz no acredita por sí sola firma o aprobación del PO.
