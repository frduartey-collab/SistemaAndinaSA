# Validación reproducible de contratos

Ejecutar `npm run validate:contracts` desde la raíz. Se valida YAML sin claves repetidas, estructura OpenAPI 3.1, referencias internas resolubles, Schema Objects mediante JSON Schema 2020-12, ejemplos y ausencia de cuerpo en respuestas 204.

El esquema original está en scripts/openapi-3.1.schema.json, obtenido de https://raw.githubusercontent.com/OAI/spec.openapis.org/main/oas/3.1/schema/2022-10-07 . Su identificador es https://spec.openapis.org/oas/3.1/schema/2022-10-07 .

Adaptación del validador: AJV presenta un problema de resolución de los anclajes dinámicos de ese metaschema en este uso. El script fija las cuatro referencias #meta a la definición original $defs/schema, para contratos sin dialectos personalizados, y valida cada Schema Object separadamente con JSON Schema 2020-12. El archivo oficial se conserva íntegro. Esta adaptación no valida dialectos OAS personalizados.

Hay 3 operaciones de autenticación y 5 de activos. Los tests comparan la lista contractual con las rutas del código, los enums con dominio.ts y los cuerpos reales con schemas. Las entradas de la API se validan directamente desde los contratos al ejecutar. La validación técnica no sustituye el acta de aceptación del PO.
