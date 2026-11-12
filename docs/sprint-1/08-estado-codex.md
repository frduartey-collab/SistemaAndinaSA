# Estado de Codex — Sprint 1

Actualizado: 12/11/2026. HU-01 (3 SP) y HU-02 (5 SP). Repositorio: [SistemaAndinaSA](https://github.com/frduartey-collab/SistemaAndinaSA). Esta actualización continúa la rama codex/sprint-1-hu01-hu02-20261112 y sustituye la descripción anterior de permisos, campos y paginación de activos.

## HU-02 implementada según la nueva instrucción

- Contrato activos 0.2 actualizado y validado antes de los handlers. Se mantienen las cinco rutas y la conexión SQLite y el middleware JWT existentes. Auth 0.2 conserva su comportamiento.
- Tabla activos: id, codigo, nombre, marca, modelo, ubicacion, criticidad, estado, uso_acumulado_horas, fecha_alta y deleted_at. Marca/modelo opcionales y nullable; fechas controladas por servidor.
- Migración transaccional, registrada una vez en migraciones: copia equipos conservando IDs, códigos y fechas/bajas. Mantiene equipos como legado; una baja legada se copia como FUERA_DE_SERVICIO.
- SUPERVISOR y JEFATURA crean/editan/eliminan. TECNICO y TRABAJADOR solo leen. BODEGA recibe 403 SIN_PERMISO en las cinco rutas de activos.
- GET lista admite q en codigo/nombre, criticidad, estado, page=1 y size=20 (máximo 100). Devuelve PaginaActivos {items,total,page,size}; total usa los mismos filtros. Se excluyen las bajas.
- GET detalle devuelve 404 ACTIVO_NO_ENCONTRADO si no existe o está dado de baja.
- POST valida EQ- y cuatro dígitos: 400 CODIGO_FORMATO_INVALIDO. Código reservado incluso tras baja: 409 CODIGO_DUPLICADO. Inicio OPERATIVO y uso 0.
- PATCH cambia solo campos presentes permitidos. Ignora cualquier codigo recibido, incluso codigo-only (200 sin cambios). No permite estado/fecha_alta/deleted_at. Horas no negativas y finitas.
- DELETE usa UPDATE: deleted_at y estado FUERA_DE_SERVICIO. Conserva fila y unicidad. No hay DELETE físico ni máquina de transiciones de HU-04/HU-05.
- Auditoría transaccional y documentación adaptada: decisiones, GWT, modelo ER, trazabilidad y wireframes.

## Verificación acotada

Node.js 24.22.1, npm 11.9.0, TypeScript 5.9.3; strict=true, sin any explícito en el código TypeScript.

| Comando | Resultado |
| --- | --- |
| npm run validate:contracts | PASS, 3 operaciones auth + 5 activos |
| npm run build | PASS, sin errores TypeScript |
| npm test | 40 passed, 0 failed, 0 skipped, 0 cancelled |

El repositorio tenía 35 pruebas, que se conservaron adaptando expectativas a las nuevas reglas. Se agregaron solo los cinco casos de Supertest solicitados: creación, duplicado, TECNICO sin escritura, búsqueda q y baja con FUERA_DE_SERVICIO. El total es 40, pues la base disponible no era la de cuatro pruebas mencionada en el prompt. La prueba existente HU02-14 cubre la migración única y persistencia; HU02-02 cubre el rechazo de horas fuera de rango sin añadir otro caso.

Evidencias actuales: [ejecucion.json](evidencias/hu02-actualizacion/ejecucion.json), [build](evidencias/hu02-actualizacion/build.log), [contratos](evidencias/hu02-actualizacion/contratos.log), [tests](evidencias/hu02-actualizacion/tests.log). Los logs de 35 pruebas de la carpeta superior son evidencia histórica anterior a esta actualización.

## Cierre formal pendiente

Las actas continúan como borradores SIN FIRMA. Faltan peer review humano, aceptación del PO y firmas; una revisión automatizada no los sustituye. No se declaran 8 SP aceptados ni RNF productivos cumplidos. Frontend ejecutable fuera de Sprint 1; HU-03/HU-04/HU-05 permanecen como backlog.
