# HU-05 · Registro de intervención y cierre de la orden

| Criterio | Requisito | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| HU05-01 | RF-05 | Una orden en progreso de un técnico autenticado | Ese técnico envía diagnóstico, solución y minutos válidos | La orden se cierra, queda una intervención y se registra el cierre en auditoría. Los repuestos declarados se conservan como texto. |
| HU05-02 | RF-05 | Una orden del técnico todavía pendiente o con el formulario incompleto | El técnico intenta cerrarla | La orden conserva su estado. El cierre exige iniciar la orden, textos obligatorios y minutos enteros positivos. |
| HU05-03 | RF-05, RNF-08 | Una solicitud válida alcanza el servidor más de una vez | Coinciden los datos normalizados del cierre | Los reintentos devuelven el mismo cierre y la misma fecha. Solo se guarda una intervención y un evento de cierre. |
| HU05-04 | RNF-08 | Una orden que ya tiene intervención | El técnico envía datos distintos o intenta avanzar nuevamente su estado | La API rechaza la modificación y conserva el cierre original. |
| HU05-05 | RNF-08 | Una transacción que incluye la intervención, el estado y la auditoría | Falla una escritura antes de confirmar | Se revierten todos los cambios. La orden sigue en progreso y puede reintentarse. |
| HU05-06 | RF-05, RNF-08 | Una orden histórica cerrada antes de HU-05 | Un usuario autorizado consulta el detalle | Se muestra en solo lectura con intervención ausente. La orden permanece cerrada. |
| HU05-07 | RF-05, RNF-05 | Una orden asignada a un técnico | Otro técnico intenta consultarla o cerrarla, o un usuario de otro rol intenta cerrarla | Otro técnico recibe 404. Los roles sin permiso de cierre reciben 403. Supervisor y Jefatura pueden leer el detalle. |
| HU05-08 | RF-05 | El técnico completa el formulario y lo envía | La solicitud queda pendiente, falla o confirma el cierre | Se bloquea otro envío mientras carga. Si falla, conserva los campos. Si confirma, la pantalla muestra el resumen de solo lectura. |
