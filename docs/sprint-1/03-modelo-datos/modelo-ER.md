# Modelo de datos de HU-01 y HU-02

SQLite reutiliza la conexión, usuarios y sesiones existentes. foreign_keys=ON, escrituras y auditoría transaccionales, consultas parametrizadas.

```mermaid
erDiagram
  usuarios ||--o{ sesiones : tiene
  usuarios ||--o{ auditoria : realiza
  usuarios {
    integer id PK
    text rut UK
    text nombre
    text rol
    integer activo
    text password_hash
  }
  sesiones {
    text id PK
    integer usuario_id FK
    text token_hash UK
    integer expira_en
    integer revocada
  }
  activos {
    integer id PK
    text codigo UK
    text nombre
    text marca "nullable"
    text modelo "nullable"
    text ubicacion
    text criticidad
    text estado
    real uso_acumulado_horas
    text fecha_alta
    text deleted_at "nullable"
  }
  auditoria {
    integer id PK
    integer actor_id FK
    text accion
    integer entidad_id
    text fecha
  }
  intentos_login {
    text origen PK
    integer cantidad
    integer vence
  }
```

## Reglas de activos

- deleted_at nulo significa activo consultable; con fecha significa baja lógica y estado FUERA_DE_SERVICIO. La unicidad de codigo abarca ambas situaciones.
- En creación: estado OPERATIVO, uso_acumulado_horas 0 y fecha_alta del servidor. Marca/modelo opcionales parten en null.
- PATCH solo cambia campos presentes permitidos; no cambia codigo, estado, fecha_alta ni deleted_at. Uso acumulado debe ser no negativo; null permite vaciar marca/modelo.
- No se implementa una máquina de estados de OT/intervenciones.

entidad_id en auditoría identifica al activo afectado y no es una FK genérica. Autenticación usa entidad nula; actor_id puede ser nulo en intentos rechazados. No se guardan contraseñas ni tokens legibles en auditoría.

## Migración desde equipos

La migración transaccional copia una sola vez los registros de la tabla anterior equipos a activos, preservando id, codigo, nombre, ubicacion, criticidad, fechas y bajas. creado_en pasa a fecha_alta y eliminado_en a deleted_at; las bajas se copian con estado FUERA_DE_SERVICIO. Marca/modelo se inicializan en null y uso_acumulado_horas en 0. Conservar IDs mantiene la referencia lógica de la auditoría histórica.

La tabla equipos permanece como legado; las rutas trabajan únicamente con activos. Un registro de migración impide volver a importar la copia histórica al reiniciar. No se eliminan filas de ninguna tabla de activos como parte de la baja.
