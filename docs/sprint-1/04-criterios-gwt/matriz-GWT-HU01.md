# Matriz GWT HU01

Fuente de TODOS los criterios: RF-01, informe §3.1 p.4, [PDF fuente](../../referencias/Informe_del_sistema.pdf). RNF-05/06/07 en §3.2 p.4 sustentan permisos, auditoría y hash. La nueva especificación HU-01 concreta bcrypt 12, JWT de ocho horas, seed idempotente y límite por RUT. Las reglas vigentes y la aceptación formal pendiente constan en 01-alcance-y-decisiones.md.

| Criterio | RF / fuente | Given (Dado) | When (Cuando) | Then (Entonces) | Prueba |
| --- | --- | --- | --- | --- | --- |
| GWT-HU01-01 | RF-01 §3.1 p.4 | Usuario activo con RUT válido | Envía contraseña correcta | 200 con token, usuario y expiraEn=28800; /auth/me devuelve perfil | backend/tests/sprint1.test.mjs: GWT-HU01-01 |
| GWT-HU01-02 | RF-01 §3.1 p.4 | RUT mal formado, cero o DV incorrecto | Intenta iniciar sesión | 400 RUT_INVALIDO | backend/tests/sprint1.test.mjs: GWT-HU01-02 |
| GWT-HU01-03 | RF-01 §3.1 p.4 | Credenciales incorrectas o usuario inexistente | Intenta iniciar sesión | 401 CREDENCIALES_INVALIDAS, sin distinguir cuál dato falló | backend/tests/sprint1.test.mjs: GWT-HU01-03 |
| GWT-HU01-04 | RF-01 §3.1 p.4 | Usuario inactivo con contraseña correcta | Intenta iniciar sesión | 403 USUARIO_INACTIVO | backend/tests/sprint1.test.mjs: GWT-HU01-04 |
| GWT-HU01-05 | RF-01 §3.1 p.4 | Cinco fallos 401 del mismo RUT normalizado en cinco minutos | Envía el siguiente intento | 429 DEMASIADOS_INTENTOS con Retry-After; otro RUT no se bloquea y el original se recupera al vencer la ventana | backend/tests/sprint1.test.mjs: GWT-HU01-05 |
| GWT-HU01-06 | RF-01 §3.1 p.4 | Sesión válida | Cierra sesión y reutiliza su token | 204 vacío; token rechazado con 401 | backend/tests/sprint1.test.mjs: GWT-HU01-06 |
| GWT-HU01-07 | RF-01 §3.1 p.4 | Token ausente, manipulado o expirado | Consulta un recurso protegido | 401 y WWW-Authenticate: Bearer | backend/tests/sprint1.test.mjs: GWT-HU01-07 |
| GWT-HU01-08 | RF-01 §3.1 p.4 | Usuario con sesión válida | Se desactiva en el repositorio de usuarios | Su token deja de permitir acceso | backend/tests/sprint1.test.mjs: GWT-HU01-08 |
| GWT-HU01-09 | RF-01 §3.1 p.4 | Solicitud incompleta o con campos extra | Solicita login | 400 DATOS_INVALIDOS | backend/tests/sprint1.test.mjs: GWT-HU01-09 |
| GWT-HU01-10 | RF-01 §3.1 p.4 | Una contraseña de prueba | Genera dos hashes y los verifica | bcrypt de coste 12 con sales diferentes, verificación correcta y sin texto plano; scrypt legado mantiene compatibilidad | backend/tests/sprint1.test.mjs: GWT-HU01-10 |
| GWT-HU01-11 | RF-01 §3.1 p.4 | Dos sesiones del mismo usuario | Cierra solo la primera | La segunda sigue válida | backend/tests/sprint1.test.mjs: GWT-HU01-11 |
| GWT-HU01-12 | RF-01 §3.1 p.4 | Configuración sin secreto suficiente | Inicializa API | Rechaza el arranque antes de exponer rutas | backend/tests/sprint1.test.mjs: GWT-HU01-12 |

Se conservan los IDs al adaptar las pruebas existentes. Los casos esenciales de autenticación con supertest cubren el flujo solicitado; los resultados reales se registran en 08-estado-codex.md. La revisión debe comprobar además seed idempotente, compatibilidad scrypt y persistencia de contadores por RUT. HU02-08 conserva la matriz de roles vigente. Ejecutar pruebas no firma una historia: aceptación del PO y peer review humano siguen pendientes.
