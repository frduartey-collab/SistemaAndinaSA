# Matriz GWT HU01

Fuente de TODOS los criterios: RF-01, informe §3.1 p.4, [PDF fuente](../../referencias/Informe_del_sistema.pdf). RNF-05/06/07 en §3.2 p.4 sustentan permisos, auditoría y hash. D-01..D-05 concretan políticas por ratificar con PO.

| Criterio | RF / fuente | Given (Dado) | When (Cuando) | Then (Entonces) | Prueba |
| --- | --- | --- | --- | --- | --- |
| GWT-HU01-01 | RF-01 §3.1 p.4 | Usuario activo con RUT válido | Envía contraseña correcta | 200 con token, usuario y expiraEn; /auth/me devuelve perfil | backend/tests/sprint1.test.mjs: GWT-HU01-01 |
| GWT-HU01-02 | RF-01 §3.1 p.4 | RUT mal formado, cero o DV incorrecto | Intenta iniciar sesión | 400 RUT_INVALIDO | backend/tests/sprint1.test.mjs: GWT-HU01-02 |
| GWT-HU01-03 | RF-01 §3.1 p.4 | Credenciales incorrectas o usuario inexistente | Intenta iniciar sesión | 401 CREDENCIALES_INVALIDAS, sin distinguir cuál dato falló | backend/tests/sprint1.test.mjs: GWT-HU01-03 |
| GWT-HU01-04 | RF-01 §3.1 p.4 | Usuario inactivo con contraseña correcta | Intenta iniciar sesión | 403 USUARIO_INACTIVO | backend/tests/sprint1.test.mjs: GWT-HU01-04 |
| GWT-HU01-05 | RF-01 §3.1 p.4 | Cuatro intentos fallidos desde una IP | Falla por quinta vez | 429 DEMASIADOS_INTENTOS con Retry-After; se recupera al vencer la ventana | backend/tests/sprint1.test.mjs: GWT-HU01-05 |
| GWT-HU01-06 | RF-01 §3.1 p.4 | Sesión válida | Cierra sesión y reutiliza su token | 204 vacío; token rechazado con 401 | backend/tests/sprint1.test.mjs: GWT-HU01-06 |
| GWT-HU01-07 | RF-01 §3.1 p.4 | Token ausente, manipulado o expirado | Consulta un recurso protegido | 401 y WWW-Authenticate: Bearer | backend/tests/sprint1.test.mjs: GWT-HU01-07 |
| GWT-HU01-08 | RF-01 §3.1 p.4 | Usuario con sesión válida | Se desactiva en el repositorio de usuarios | Su token deja de permitir acceso | backend/tests/sprint1.test.mjs: GWT-HU01-08 |
| GWT-HU01-09 | RF-01 §3.1 p.4 | Solicitud incompleta o con campos extra | Solicita login | 400 DATOS_INVALIDOS | backend/tests/sprint1.test.mjs: GWT-HU01-09 |
| GWT-HU01-10 | RF-01 §3.1 p.4 | Una contraseña de prueba | Genera dos hashes y los verifica | Sales diferentes; verificación segura; sin texto plano | backend/tests/sprint1.test.mjs: GWT-HU01-10 |
| GWT-HU01-11 | RF-01 §3.1 p.4 | Dos sesiones del mismo usuario | Cierra solo la primera | La segunda sigue válida | backend/tests/sprint1.test.mjs: GWT-HU01-11 |
| GWT-HU01-12 | RF-01 §3.1 p.4 | Configuración sin secreto suficiente | Inicializa API | Rechaza el arranque antes de exponer rutas | backend/tests/sprint1.test.mjs: GWT-HU01-12 |

Evidencia automatizada: cada ID aparece en el título de una prueba; HU02-08 se parametriza para los cuatro roles de consulta. Pendiente aceptación y firma del PO; ejecutar tests no firma una historia.
