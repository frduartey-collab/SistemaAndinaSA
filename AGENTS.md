# Proyecto: Sistema de Mantenimiento — Manufacturas Andina
# Enfoque: Documentation Oriented Development (DDD)

## Reglas no negociables
- Toda funcionalidad DEBE tener primero su contrato OpenAPI en /docs/sprint-1/02-contratos-api/
- El código NO se escribe hasta que el contrato exista y esté validado.
- Cada endpoint implementado debe coincidir 1:1 con los tipos de dominio.ts
- Usar TypeScript estricto (strict: true en tsconfig.json)
- Stack: Node.js + Express + TypeScript (backend). SQLite para el avance (sin ORM complejo).

## Estructura del repositorio
/docs/sprint-1/      ← documentación (contratos, GWT, modelo ER)
/backend/            ← código que genera Codex
/frontend/           ← (fuera de alcance Sprint 1)

## "Done" para una tarea de Codex
1. El código compila (npm run build sin errores)
2. Los tipos de dominio.ts coinciden con el contrato OpenAPI
3. Existe al menos un test básico que valida el endpoint (puede ser con supertest)
4. Codex actualiza el archivo de estado en /docs/sprint-1/08-estado-codex.md
