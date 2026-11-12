import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('../', import.meta.url));
const official = JSON.parse(readFileSync(new URL('./openapi-3.1.schema.json', import.meta.url), 'utf8'));
// AJV no resuelve correctamente aquí los anclajes dinámicos del metaschema OAS.
// No usamos dialectos personalizados: fijamos #meta a su $defs/schema original,
// y validamos aparte TODOS los Schema Objects con JSON Schema 2020-12.
function normalize(node) {
  if (!node || typeof node !== 'object') return;
  if (node.$dynamicRef === '#meta') { node.$ref = '#/$defs/schema'; delete node.$dynamicRef; }
  Object.values(node).forEach(normalize);
}
normalize(official);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat('media-range', /^[\w!#$&^_.+-]+\/[\w!#$&^_.+*-]+(?:\s*;.*)?$/);
const validate = ajv.compile(official);
let operations = 0;
for (const name of ['auth', 'activos']) {
  const doc = parseDocument(readFileSync(resolve(root, `docs/sprint-1/02-contratos-api/${name}.openapi.yaml`), 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join('\n'));
  const data = doc.toJSON();
  if (!validate(data)) throw new Error(JSON.stringify(validate.errors));
  function refs(node) {
    if (!node || typeof node !== 'object') return;
    if (node.$ref) {
      if (!node.$ref.startsWith('#/')) throw new Error('Referencia externa no admitida: ' + node.$ref);
      let target = data;
      for (const key of node.$ref.slice(2).split('/')) target = target?.[key.replaceAll('~1', '/').replaceAll('~0', '~')];
      if (!target) throw new Error('Referencia sin resolver: ' + node.$ref);
    }
    Object.values(node).forEach(refs);
  }
  refs(data);
  const defs = JSON.parse(JSON.stringify(data.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'));
  for (const [schemaName, schema] of Object.entries(data.components.schemas)) {
    const check = ajv.compile({ $defs: defs, $ref: '#/$defs/' + schemaName });
    for (const example of schema.examples ?? []) if (!check(example)) throw new Error(schemaName + ': ejemplo inválido ' + JSON.stringify(check.errors));
  }
  for (const item of Object.values(data.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'patch', 'delete', 'put'].includes(method)) continue;
      operations++;
      if (operation.responses['204']?.content) throw new Error('204 no debe definir cuerpo');
    }
  }
  console.log(`OK ${name}: OpenAPI 3.1, claves únicas, referencias, schemas 2020-12 y ejemplos`);
}
console.log(`OK ${operations} operaciones contractuales`);
