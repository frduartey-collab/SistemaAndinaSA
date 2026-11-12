# Wireframes de Sprint 1

Tres propuestas vectoriales; no son un frontend ejecutable:

1. [Login](01-login.svg): RF-01, HU-01; RUT/contraseña y mensajes de error.
2. [Catálogo](02-catalogo-equipos.svg): RF-02 y RF-01, HU-02; consulta, edición, baja y cierre de sesión.
3. [Formulario](03-formulario-equipo.svg): RF-02, HU-02; identificación, marca/modelo, ubicación, criticidad y uso; estado solo informativo.

Fuente: informe §3.1 p.4 y nueva instrucción HU-02 del usuario. El catálogo con acciones corresponde a SUPERVISOR o JEFATURA. TECNICO y TRABAJADOR solo consultan; BODEGA no accede al módulo. El backend aplica esos permisos en lista, detalle y escritura.

El código se introduce al crear y queda fijo al editar. Marca/modelo son opcionales; estado y fechas no se editan. El uso empieza en 0 y admite actualización no negativa. La baja asigna deleted_at y FUERA_DE_SERVICIO, conserva la fila y oculta el activo de la lista/detalle. No hay controles para transiciones generales de estado. El listado admite q, criticidad, estado y page/size.

Pendiente revisión visual y aceptación del PO.
