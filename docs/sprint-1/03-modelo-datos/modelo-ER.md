# Modelo de datos implementado

SQLite con foreign_keys=ON, transacciones en escrituras de equipos y consultas parametrizadas.

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
  equipos {
    integer id PK
    text codigo UK
    text nombre
    text ubicacion
    text criticidad
    text estado
    text creado_en
    text actualizado_en
    text eliminado_en
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

eliminado_en nulo significa equipo consultable; con fecha significa baja lógica. La unicidad del código abarca ambas situaciones. entidad_id en auditoría identifica al equipo afectado y no es una FK genérica; los eventos de autenticación usan entidad nula. actor_id puede ser nulo en intentos rechazados. No se almacena contraseña ni token legible en auditoría.
