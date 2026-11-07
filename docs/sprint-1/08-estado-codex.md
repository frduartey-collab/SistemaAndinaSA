# Estado de Codex — Sprint 1

## Alcance completado

- Se incorporó a la raíz el `AGENTS.md` proporcionado, sin modificar sus reglas.
- Se creó y validó primero `02-contratos-api/auth.openapi.yaml`, con OpenAPI 3.1.0.
- El contrato documenta `POST /auth/login`, `GET /auth/me` y `POST /auth/logout`,
  autenticación JWT Bearer y los cuatro errores de login solicitados.
- Se creó `backend/src/dominio.ts` con exactamente cuatro tipos exportados:
  `Rol`, `CodigoEquipo`, `CriticidadEquipo` y `EstadoEquipo`.
- Se añadió la configuración mínima de compilación con `strict: true`,
  TypeScript 5.9.3 como única dependencia de desarrollo y un lockfile de npm.

El informe del sistema se utilizó como contexto para RF-01 / HU-01.
No se implementaron endpoints, autenticación ni persistencia. Express y SQLite
no se instalaron porque todavía no son necesarios para compilar los tipos.

## Convenciones del contrato

- `UsuarioSesion` incluye `id`, `rut`, `nombre`, `rol` y `activo`, todos obligatorios.
- `id` es un entero positivo y `expiraEn` expresa la vigencia del token en segundos.
- El RUT se representa sin puntos y con guion; su dígito verificador debe validarse
  por módulo 11 al implementar la autenticación. El patrón del esquema solo
  comprueba el formato.
- Los errores de login utilizan `{ codigo, mensaje }` con un código específico
  para cada estado HTTP.
- `/auth/me` y `/auth/logout` heredan la seguridad Bearer; `/auth/login` es público.
- Cerrar sesión debe invalidar el acceso de esa sesión; el mecanismo de revocación,
  la duración de los tokens y los límites de intentos quedan para la implementación.
- Se normalizó a `EN_MANTENCIÓN` el estado cuya tilde llegó con codificación dañada.

## Verificación

- `npm run build`: compilación correcta desde la raíz del repositorio.
- YAML válido, sin claves duplicadas.
- Estructura del contrato validada con el esquema oficial de OpenAPI 3.1
  (`https://spec.openapis.org/oas/3.1/schema/2022-10-07`), obtenido del repositorio
  oficial `OAI/spec.openapis.org` en GitHub.
- Componentes revisados como JSON Schema 2020-12 y referencias internas resueltas.
- Ejemplos y 23 casos de aceptación/rechazo de payloads verificados, incluidos
  campos requeridos, roles permitidos, errores por estado HTTP y `expiraEn`.
- Coincidencia exacta, incluido el orden, entre el enum `Rol` del YAML y la unión
  de TypeScript; verificados también los otros tres tipos y las cuatro exportaciones.
- Respuesta 204 de logout sin cuerpo.

No se ejecutaron pruebas HTTP: no existen endpoints implementados en este alcance.

## Compilación local

Desde la raíz del repositorio, con Node.js y npm disponibles:

```sh
npm ci --ignore-scripts
npm run build
```

Los resultados se generan en `backend/dist/`, que está excluido de Git junto con
`node_modules/`. La validación se realizó con Node.js 24.22.1 y npm 11.9.0.
