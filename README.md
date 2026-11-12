# Manufacturas Andina: Sprint 1

Backend Node.js + Express + TypeScript estricto y SQLite. Alcance: HU-01 (RF-01, 3 SP) y HU-02 (RF-02, 5 SP). El frontend funcional sigue fuera del alcance de este sprint; se incluyen tres wireframes.

## Preparación local

Requiere Node.js 24.22.1 (rama 24) y npm. SQLite viene incluido en Node; no hay que instalar un servidor de base de datos.

1. `npm ci --ignore-scripts`
2. `cp .env.example .env`
3. Genera una clave con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y copia el resultado a JWT_SECRET en .env.
4. En .env define SEED_PASSWORD con una contraseña de desarrollo de al menos 12 caracteres. SEED_RUT debe ser válido; el ejemplo 12345678-5 es de demostración. SEED_ROL admite SUPERVISOR, TECNICO, TRABAJADOR, BODEGA o JEFATURA.
5. `npm run seed` crea ese usuario; no reemplaza usuarios existentes.
6. `npm start` inicia en http://127.0.0.1:3000, después de que seed haya compilado. Si no ejecutaste seed, usa `npm run build` antes de start. `npm run dev` compila e inicia.

No subas .env, claves, contraseñas ni bases de datos. No hay cuentas ni secretos de producción precargados. Para crear otro usuario de demostración, cambia SEED_RUT/SEED_ROL y repite seed. La creación de usuarios mediante HTTP está fuera de HU-01/HU-02.

## Verificación

- `npm run validate:contracts`: estructura OpenAPI, referencias y schemas.
- `npm run build`: TypeScript estricto.
- `npm test`: compila y ejecuta pruebas HTTP reales en puertos locales temporales, con bases aisladas.

## Endpoints

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | /auth/login | Público, RUT y contraseña |
| GET | /auth/me | Sesión válida |
| POST | /auth/logout | Sesión válida; revocación inmediata |
| GET | /activos | Todos los roles autenticados; limit 1..100, offset >= 0 |
| POST | /activos | SUPERVISOR |
| GET | /activos/{id} | Todos los roles autenticados |
| PATCH | /activos/{id} | SUPERVISOR |
| DELETE | /activos/{id} | SUPERVISOR, baja lógica |

Envía el token del login en el encabezado Authorization con el valor Bearer seguido de un espacio y el token. Login devuelve token, usuario y expiraEn. El esquema de equipo y ejemplos de errores están en [los contratos](docs/sprint-1/02-contratos-api/).

## Políticas implementadas, pendientes de ratificación del PO

- Solo SUPERVISOR escribe equipos; los cinco roles consultan.
- Código EQ- y cuatro dígitos, único incluso después de la baja.
- Quinto intento fallido por IP bloquea durante el resto de la ventana de 15 minutos; Retry-After indica segundos pendientes.
- JWT HS256: vigencia de 3600 segundos y sesión persistida, revocable. El rol y activo se consultan de nuevo en cada petición.
- Contraseñas scrypt con sal aleatoria de 16 bytes, N=32768, r=8, p=3, salida de 64 bytes; nunca texto plano. SQLite en disco tiene permisos 0600.
- El token solo se guarda en base de datos como SHA-256. La auditoría registra actor, acción, entidad y fecha, sin tokens ni contraseñas.

Estas políticas concretan aspectos no definidos por el informe; no representan una aceptación firmada del PO. El servidor escucha solo en localhost y no confía en X-Forwarded-For. Para despliegue se requiere configurar TLS, proxy confiable, copias de seguridad, secretos y mediciones RNF. No se declara disponibilidad 99,5% ni capacidad de 50 usuarios sin pruebas de entorno.

## Documentación y cierre

- [Informe fuente](docs/referencias/Informe_del_sistema.pdf)
- [Auditoría final y pendientes reales](docs/sprint-1/09-auditoria-final.md)
- [Criterios GWT](docs/sprint-1/04-criterios-gwt/)
- [Wireframes](docs/sprint-1/05-wireframes/README.md)
- [Trazabilidad](docs/sprint-1/06-trazabilidad/RF-HU-GWT.md)
- [Estado de implementación](docs/sprint-1/08-estado-codex.md)

Las actas incluidas son borradores preparados para firma. La aprobación del PO y el peer review humano siguen pendientes y mantienen abierto el cierre formal del sprint.
