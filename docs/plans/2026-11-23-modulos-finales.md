# Últimos módulos de SIGEM

El orden de entrega aprobado es Preventivos, Dashboard, Suscripciones y funciones Empresa. Cada cambio de API se valida en OpenAPI antes de integrarlo y se comprueba con datos de prueba aislados.

| Bloque | Casos que deben quedar comprobados |
| --- | --- |
| Preventivos | Ambos planes programan por fecha. Empresa programa por horas y ve alertas. Repetir una evaluación conserva una sola orden por ciclo y permite trabajarla con el flujo de cierre existente. |
| Dashboard | Supervisor y Jefatura consultan solo su organización. Las métricas distinguen un indicador sin datos de un valor cero. |
| Suscripciones | Un pago validado cambia la suscripción y el plan en una transacción. Repetir un evento conserva un solo cobro. Se puede probar el flujo con pagos simulados. |
| Empresa | Un usuario asignado opera los equipos de su sede. Jefatura conserva el acceso transversal. El Dashboard puede consolidar o filtrar. La API de ERP autentica cada integración, aísla clientes y aplica stock de forma consistente. |
