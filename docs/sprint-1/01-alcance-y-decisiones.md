# Alcance y decisiones del Sprint 1

Fecha: 12/11/2026. Sprint 1: HU-01 (3 SP) + HU-02 (5 SP) = 8 SP. Fuente: informe, §3.1 y §3.2, p.4; historias §5.1 p.5; estimación §8.1 p.6.

## Autorización de esta iteración

La solicitud inicial exigía solo auditar. Tras comunicar los faltantes, el usuario indicó «Implementa todas las funciones y archivos que necesite». Esa instrucción posterior habilita la implementación de los faltantes del Sprint 1. HU-03, HU-04 y HU-05 se conservan como backlog de Sprint 2, sin declarar sus endpoints implementados.

## Decisiones propuestas para revisar con el PO

| ID | Decisión implementada | Motivo / estado |
| --- | --- | --- |
| D-01 | SUPERVISOR escribe equipos; demás roles solo consultan | Coherente con HU-02, pendiente de aprobación de la matriz exacta |
| D-02 | EQ- seguido de cuatro dígitos, mayúsculas | Concreta EQ-XXXX; el PDF no especifica esos dígitos |
| D-03 | Baja lógica; conservar código único aunque se elimine | Preserva trazabilidad y evita confundir activos históricos |
| D-04 | Quinto fallo por IP bloquea en ventana de 15 minutos | Concreta DEMASIADOS_INTENTOS; requiere ajuste al entorno |
| D-05 | JWT HS256, 60 minutos, revocación persistida | Permite logout real y sesiones independientes |
| D-06 | SQLite local y API en localhost | Avance solicitado en AGENTS.md, no despliegue productivo |
| D-07 | Wireframes de login, catálogo y formulario | El frontend ejecutable queda fuera del Sprint 1 según AGENTS.md |

Los contratos se definieron y validaron antes de escribir sus handlers. Se amplió auth 0.1 a 0.2 para declarar DATOS_INVALIDOS en estructuras malformadas y NO_AUTORIZADO en sesiones inválidas, conservando los cuatro errores de login solicitados. No se afirma que estas decisiones estén firmadas.
