# SIGEM · Manufacturas Andina S.A.

SIGEM reúne el catálogo de equipos, las fallas, las órdenes de trabajo y el inventario. React y la API de Node.js se publican en un mismo origen HTTPS. SQLite y las fotografías viven en el servidor compartido.

## Publicar e instalar en seis pasos

1. Utiliza la rama `main` de `frduartey-collab/SistemaAndinaSA`. Comprueba en GitHub que contiene `render.yaml`. Los archivos privados de tu Mac quedan fuera del despliegue.
2. En el [panel de Render](https://dashboard.render.com/) abre **New → Blueprint**, conecta GitHub y selecciona el repositorio y la rama `main`.
3. En la vista previa comprueba **Web Service → Starter**, una instancia y el disco **sigem-datos**, de **1 GB**, montado en `/var/data`. Revisa el cargo del servicio y del disco antes de pulsar **Deploy Blueprint**. El plan gratuito carece de disco persistente. [Discos de Render](https://render.com/docs/disks)
4. Cuando el servicio indique **Live**, abre y copia el enlace HTTPS que Render muestra en su cabecera. En **Environment** consulta la contraseña `DEMO_PASSWORD_` del rol que vas a probar. Entrega a cada compañero solo su RUT y su contraseña por un canal privado.
5. Abre el enlace en el dispositivo. En PC usa Chrome o Edge y elige **Instalar SIGEM** desde la barra o el menú. En Android abre Chrome y elige **Instalar aplicación** o **Añadir a pantalla de inicio**. En iPhone abre Safari, toca **Compartir → Añadir a pantalla de inicio** y activa **Abrir como app web** si aparece. [Instalación de PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing)
6. Crea una falla de demostración con una foto. Comprueba desde un segundo dispositivo con Supervisor que aparece. Reinicia el servicio desde Render y vuelve a abrir la foto. La prueba puede hacerse con el Mac apagado.

## Cuentas de la demo

| Rol | RUT | Contraseña en Render o en el archivo local .env |
| --- | --- | --- |
| Supervisor | 11111111-1 | `DEMO_PASSWORD_SUPERVISOR` |
| Técnico | 22222222-2 | `DEMO_PASSWORD_TECNICO` |
| Trabajador | 33333333-3 | `DEMO_PASSWORD_TRABAJADOR` |
| Bodega | 44444444-4 | `DEMO_PASSWORD_BODEGA` |
| Jefatura | 55555555-5 | `DEMO_PASSWORD_JEFATURA` |

Al primer arranque, una transacción crea el cliente Empresa de demostración, cinco cuentas, dos equipos y dos repuestos con stock inicial. Una base con datos conserva sus cuentas, contraseñas y registros. Las variables demo se utilizan solo al crear las cuentas. Mantén SQLite y la carpeta de fotos en el mismo volumen y respalda ambos juntos.

## Ejecutar el mismo sitio en local

Desde la raíz del repositorio, con Node 24.22.x y npm, ejecuta:

```sh
npm ci
npm ci --prefix frontend
npm run env:local
npm run build
npm start
```

Abre [SIGEM local](http://127.0.0.1:3000). `env:local` crea un archivo privado con claves aleatorias si falta y conserva cualquier `.env` existente. Si ya tenías uno y eliges una base vacía, añade las cinco variables demo de `.env.example` con claves diferentes. Para seguir usando tus datos locales, conserva tu `DB_PATH`. El valor por defecto es `backend/data/app.db` y las nuevas fotografías se guardan en `backend/data/uploads`.

Durante el desarrollo también puedes iniciar la API con `npm run dev` y Vite con `npm --prefix frontend run dev` en otra terminal. Abre [la interfaz con recarga automática](http://127.0.0.1:5173). En producción las rutas públicas de la API empiezan por `/api`, por ejemplo `/api/auth/login` y `/api/v1/erp/costos-repuestos`. Las operaciones con datos requieren conexión. El aviso de desconexión de la PWA permite volver a intentar la navegación.

Desde **Equipos** puedes buscar, filtrar y consultar fichas. SUPERVISOR y JEFATURA también pueden crear, editar y confirmar una baja. TECNICO y TRABAJADOR tienen acceso de lectura, y BODEGA ve la pantalla de acceso restringido. La baja retira el equipo de la lista y conserva su código reservado.

El frontend usa React, TypeScript, React Router y Vite. En desarrollo, Vite reenvía las peticiones /api/ a la API local del puerto 3000. Para revisar la compilación, ejecuta npm run build dentro de frontend.

## Registro de cuentas y fallas

Desde el login, **¿No tienes cuenta? Regístrate** permite crear una cuenta de Técnico o Trabajador con RUT, nombre y contraseña. Al terminar, la interfaz vuelve al login con el RUT rellenado. Con una sesión de Supervisor o Jefatura, **Crear cuenta** permite dar de alta a Bodega. Solo Jefatura puede asignar Supervisor o Jefatura.

En **Fallas**, busca un equipo por código o nombre, describe el problema y guarda el reporte. La criticidad del equipo sugiere una prioridad. Puedes seleccionar otra prioridad antes de guardar. Técnico y Trabajador ven sus propios reportes. Supervisor y Jefatura ven todos y Bodega tiene el acceso restringido.

Cada reporte admite hasta tres fotos y los usuarios autorizados pueden abrirlas en el reporte o desde su orden. El API guarda el reporte con el autor de la sesión, la prioridad, la fecha y el estado Reportada. Reinicia el proceso de la API después de actualizar para que SQLite cree la tabla fallas.

## Órdenes de trabajo

En **Órdenes**, Supervisor y Jefatura pueden elegir una falla pendiente, asignar un técnico activo y fijar una fecha límite. También pueden abrir **Fallas → Fallas sin orden → Crear orden** para partir con la falla seleccionada. Cada falla de un equipo vigente se puede asignar una vez.

El técnico ve sus propias órdenes. La secuencia es **Pendiente → En progreso → Cerrada**. Pueden avanzar el estado el técnico asignado, Supervisor o Jefatura. La fecha límite se valida como fecha civil de Chile. El cierre de esta etapa cambia el estado. Los datos de intervención y repuestos corresponden a HU-05.

El formulario de registro y la API comparten el algoritmo Módulo 11 del RUT. El registro muestra el error del dígito verificador antes de enviar la solicitud.

## Verificación

- `npm run validate:contracts`: estructura OpenAPI, referencias y schemas.
- `npm run build`: TypeScript estricto.
- `npm test`: compila y ejecuta las pruebas existentes adaptadas y los casos esenciales de autenticación y activos con supertest, usando bases aisladas.

Los resultados y su fecha se registran en [el estado de implementación](docs/sprint-1/08-estado-codex.md).

## Endpoints y permisos

Envía el token del login en Authorization como Bearer seguido de un espacio y el token. Login devuelve token, usuario y expiraEn.

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | /auth/login | Público, RUT y contraseña |
| POST | /auth/register | Técnico/Trabajador públicos; roles reservados con autorización |
| GET | /auth/me | Sesión válida |
| POST | /auth/logout | Sesión válida; revocación inmediata |
| GET | /activos | SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR |
| POST | /activos | SUPERVISOR y JEFATURA |
| GET | /activos/{id} | SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR |
| PATCH | /activos/{id} | SUPERVISOR y JEFATURA |
| DELETE | /activos/{id} | SUPERVISOR y JEFATURA, baja lógica |
| POST | /fallas | SUPERVISOR, JEFATURA, TECNICO y TRABAJADOR |
| GET | /fallas | Todos para SUPERVISOR/JEFATURA; propios para TECNICO/TRABAJADOR |
| POST | /ordenes | SUPERVISOR y JEFATURA |
| GET | /ordenes | Todas para SUPERVISOR/JEFATURA; asignadas para TECNICO |
| GET | /ordenes/tecnicos | SUPERVISOR y JEFATURA |
| PATCH | /ordenes/{id}/estado | SUPERVISOR, JEFATURA o el técnico asignado |

BODEGA recibe 403 SIN_PERMISO en las cinco operaciones de activos. Una petición sin sesión válida recibe 401 NO_AUTORIZADO.

## Uso de activos

GET /activos admite q (subcadena literal en codigo o nombre), criticidad, estado, page (por defecto 1) y size (por defecto 20, máximo 100). Ejemplo: `/activos?q=Prensa&criticidad=ALTA&page=1&size=20`. Devuelve PaginaActivos con items, total, page y size; total aplica los mismos filtros que items. Los activos dados de baja se excluyen tanto de la lista como del detalle. El detalle inexistente o dado de baja devuelve 404 ACTIVO_NO_ENCONTRADO.

POST requiere codigo, nombre, ubicacion y criticidad. Marca y modelo son opcionales y admiten null. El servidor asigna estado OPERATIVO, uso_acumulado_horas 0 y fecha_alta. El código debe tener formato EQ-0000; otro formato da 400 CODIGO_FORMATO_INVALIDO. Un código ya reservado, incluso dado de baja, da 409 CODIGO_DUPLICADO.

PATCH modifica solo los campos presentes: nombre, marca, modelo, ubicacion, criticidad y uso_acumulado_horas (no negativo). Omitir conserva el valor; null vacía marca/modelo. Cualquier codigo recibido se ignora; una petición que solo contiene codigo responde 200 sin cambios. No permite editar estado, fecha_alta ni deleted_at. Las transiciones generales de estado corresponden a HU-04/HU-05, fuera de esta entrega.

DELETE conserva la fila y el código reservado: asigna deleted_at y fija estado FUERA_DE_SERVICIO. Las respuestas usan id, codigo, nombre, marca, modelo, ubicacion, criticidad, estado, uso_acumulado_horas, fecha_alta y deleted_at. Esquemas y ejemplos están en [los contratos](docs/sprint-1/02-contratos-api/).

## Persistencia y migración

La conexión better-sqlite3 se centraliza en db.ts; se conservan usuarios, sesiones, activos y sus campos. Los intentos de login usan intentos_login.origen como clave de RUT normalizado, en lugar de IP, sin perder la persistencia al reiniciar.

La tabla de trabajo es activos. Al abrir una base de la versión anterior, una migración transaccional de una sola ejecución copia equipos conservando IDs, códigos y fechas de alta/baja. Los registros dados de baja se copian con FUERA_DE_SERVICIO; marca/modelo parten en null y uso_acumulado_horas en 0. La tabla equipos se conserva como legado y no se usa en las rutas nuevas. El registro de migración evita reimportar datos en cada arranque. Se reutilizan la conexión SQLite, usuarios, sesiones y auditoría.

## Seguridad y decisiones

- Acceso a activos según la matriz solicitada por el usuario el 12/11/2026; sustituye la política anterior de SUPERVISOR único escritor y cinco roles lectores.
- Código EQ- y cuatro dígitos, inmutable y único incluso tras la baja.
- Cinco intentos de login fallidos por RUT normalizado reciben 401 dentro de una ventana de cinco minutos. El siguiente intento recibe 429 DEMASIADOS_INTENTOS con Retry-After; otro RUT mantiene un contador independiente. Los contadores persisten en SQLite.
- JWT HS256 firmado con jsonwebtoken, vigente durante ocho horas (28800 segundos), con sesión persistida y revocable. Rol y estado del usuario se consultan en cada petición. Logout invalida el token de esa sesión, como exige el contrato; no se adopta logout stateless.
- Contraseñas nuevas con bcrypt, coste 12. El login conserva compatibilidad con hashes scrypt anteriores: tras autenticar una contraseña de hasta 72 bytes, actualiza su hash a bcrypt. Si la contraseña heredada supera 72 bytes, conserva scrypt para evitar truncamiento. SQLite en disco tiene permisos 0600.
- El token se guarda como SHA-256. La auditoría guarda actor, acción, entidad y fecha, sin contraseñas ni tokens legibles.

En desarrollo el servidor escucha en localhost. En producción usa el puerto asignado y Render termina TLS. En Render, Express confía en un salto del proxy para el límite de registros por IP. Esta entrega local no acredita disponibilidad 99,5% ni 50 usuarios concurrentes.

## Documentación y cierre

- [Informe fuente](docs/referencias/Informe_del_sistema.pdf)
- [Auditoría y pendientes reales](docs/sprint-1/09-auditoria-final.md)
- [Criterios GWT](docs/sprint-1/04-criterios-gwt/)
- [Wireframes](docs/sprint-1/05-wireframes/README.md)
- [Trazabilidad](docs/sprint-1/06-trazabilidad/RF-HU-GWT.md)
- [Estado de implementación](docs/sprint-1/08-estado-codex.md)

Las actas son borradores sin firma. La aceptación del PO y el peer review humano siguen pendientes para el cierre formal del sprint.
