# Trazabilidad RF - HU - GWT - contratos - código

Fuente: [Informe del sistema](../../referencias/Informe_del_sistema.pdf), §3.1/3.2 p.4, §5.1 p.5, §8.1 p.6, y especificaciones HU-01/HU-02 posteriores del usuario. Reglas vigentes: [01-alcance-y-decisiones](../01-alcance-y-decisiones.md).

| RF | HU / SP | Criterios GWT | Contrato | Implementación | Wireframe |
| --- | --- | --- | --- | --- | --- |
| RF-01: login, rol y logout | HU-01 / 3 | HU01-01..HU01-12 | auth.openapi.yaml, 3 operaciones | app.ts, seguridad.ts, db.ts, datos.ts y dominio.ts; JWT de ocho horas y revocación | 01-login.svg |
| RF-01: usuario de demostración inicial | HU-01 / 3 | Revisión de seed idempotente y CLI | Preparación local; no agrega endpoints | seed() al arrancar y CLI SEED_*; conserva usuario existente | Login |
| RF-02: crear, consultar, modificar, eliminar; identificación, ubicación, criticidad | HU-02 / 5 | HU02-01..HU02-15 | activos.openapi.yaml 0.2, 5 operaciones | app.ts, datos.ts, validacion.ts y dominio.ts; tabla activos | 02-catalogo-equipos.svg y 03-formulario-equipo.svg |
| RF-02: q, criticidad/estado y página | HU-02 / 5 | HU02-10/11 y caso esencial de búsqueda | ConsultaActivos / PaginaActivos | Filtros compartidos por items/total, page/size | Catálogo |
| RF-02: código inmutable y baja lógica | HU-02 / 5 | HU02-03..06/14 | ActivoActualizarSolicitud, errores y DELETE | PATCH ignora codigo; baja asigna deleted_at y FUERA_DE_SERVICIO | Formulario y catálogo |
| RNF-05: acceso por rol | HU-01/HU-02 | HU01-08 y HU02-08/09 | Bearer, 401/403 | JWT reutilizado; lectura/escritura según rol; BODEGA sin acceso a activos | Login y catálogo |
| RNF-06: auditoría | HU-02 | HU02-12 | Reglas del servicio | Tabla auditoria y transacciones; IDs conservados en migración | Consulta del catálogo |
| RNF-07: hash y acceso restringido | HU-01 | HU01-05/07/10/12 | Errores de acceso y Bearer | bcrypt 12, compatibilidad scrypt, jsonwebtoken, revocación y SQLite 0600; cinco fallos por RUT en cinco minutos | Login |
| RF-03 | HU-03 / propuesta 5 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |
| RF-04 | HU-04 / propuesta 8 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |
| RF-05 | HU-05 / propuesta 8 | Pendiente Sprint 2 | Pendiente | No implementado | Pendiente |

Las matrices de 04-criterios-gwt incluyen cada Given/When/Then y su RF. Las pruebas están en backend/tests; se adaptan las existentes y se cubren los casos esenciales de autenticación y activos con supertest. Estado de ejecución en 08-estado-codex.md. No se incluyen transiciones generales de estado de HU-04/HU-05 ni se acredita firma del PO.
