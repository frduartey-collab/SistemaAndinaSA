# Inventario de bodega y consumo en HU-05

## Reglas

- Bodega y Jefatura administran el catálogo y registran entradas o salidas manuales. Técnico consulta los repuestos vigentes desde el cierre de sus órdenes.
- Los repuestos se crean con stock cero y un código único. Los movimientos cambian las existencias. La edición modifica la ficha y el stock mínimo. La baja lógica exige stock cero y conserva las referencias de los cierres.
- El técnico indica repuestos distintos y cantidades enteras positivas. Un repuesto con existencias insuficientes produce HTTP 400 con su nombre y la cantidad disponible. La orden y todas las escrituras quedan como estaban.
- Guardar consumo, intervención, cierre y auditoría en una sola transacción SQLite. Comparar la lista normalizada en los reintentos para evitar un segundo descuento. Los cierres anteriores conservan las notas de repuestos y se consultan normalmente.

## Secuencia y verificación

| Paso | Entrega | Verificación |
| --- | --- | --- |
| 1 | Contrato de repuestos, catálogo, movimientos y protección por rol | OpenAPI válido. CRUD, baja lógica, entradas/salidas y rechazos sin stocks negativos. |
| 2 | Consumos en el contrato de órdenes y cierre atómico | Pruebas de stock insuficiente en el segundo repuesto, reintento idéntico y conflictivo, reversión después del descuento y lectura histórica. |
| 3 | Pantalla de Inventario con alerta de stock bajo | Chromium detecta el aviso y registra un movimiento con Bodega. |
| 4 | Selector de repuestos en el mantenimiento correctivo | Chromium conserva el formulario tras el 400, reintenta después de reponer y muestra los consumos en el resumen. |

Compilar backend y frontend, ejecutar la suite del proyecto y publicar en la rama existente.
