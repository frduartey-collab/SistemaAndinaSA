# HU-05 · Registro y cierre de intervenciones

## Alcance aprobado

El técnico asignado registra el diagnóstico, la solución, la duración en minutos enteros positivos y, opcionalmente, los repuestos utilizados en texto libre. El cierre guarda la intervención, cambia el estado y audita la operación en una misma transacción. El descuento de stock se implementará con Inventario. Las órdenes cerradas históricas siguen disponibles para consulta.

## Secuencia de implementación

1. Actualizar el contrato OpenAPI de Órdenes y validarlo con `npm run validate:contracts`. Documentar `PUT /ordenes/{id}/cierre`, `GET /ordenes/{id}` y el alcance de `PATCH /ordenes/{id}/estado`.
2. Añadir casos de integración al backend para el cierre, los permisos, el doble envío y la reversión. Implementar la tabla de intervenciones con `orden_id` único y reutilizar la transacción SQLite de la aplicación.
3. Conectar el formulario de cierre y el detalle de solo lectura en React. Conservar los datos tras errores recuperables y mostrar el resumen de la orden cerrada aun cuando deje de aparecer en el listado de pendientes.
4. Validar los contratos, ejecutar `npm test` y `npm --prefix frontend run build`, y recorrer los flujos de la interfaz en Chromium con una base en memoria.
5. Actualizar el documento de estado y publicar los cambios de HU-05 para revisión.

## Criterios y casos límite

| Caso | Verificación |
| --- | --- |
| Cierre válido | Una orden en progreso del técnico autenticado queda cerrada y tiene una intervención y un evento de cierre. |
| Identidad y permisos | Supervisor y Jefatura consultan los detalles. Trabajador y Bodega quedan excluidos de Órdenes. Otro técnico recibe 404 al consultar o cerrar una orden ajena. |
| Datos inválidos | El servidor rechaza textos obligatorios en blanco y tiempos que no sean enteros positivos. Una orden pendiente debe iniciarse antes de cerrarse. |
| Desconexión o doble envío | Tras un cierre exitoso, el reintento con los mismos datos devuelve el cierre original. Una solicitud con datos distintos recibe 409. |
| Fallo después de insertar | Si falla la actualización de estado o la auditoría, se revierte la intervención y la orden sigue en progreso. |
| Registro histórico | Una orden cerrada antes de HU-05 se consulta sin intervención. El flujo de escritura rechaza cambios a un cierre existente. |
| Interfaz | El envío se bloquea durante la solicitud. Si falla, se conserva el formulario. Si tiene éxito, se muestra el resumen. |
