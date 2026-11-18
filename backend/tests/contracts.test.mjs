import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { esquema } from '../dist/validacion.js';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const auth = parse(read('docs/sprint-1/02-contratos-api/auth.openapi.yaml'));
const activos = parse(read('docs/sprint-1/02-contratos-api/activos.openapi.yaml'));
const fallas = parse(read('docs/sprint-1/02-contratos-api/fallas.openapi.yaml'));
const ordenes = parse(read('docs/sprint-1/02-contratos-api/ordenes.openapi.yaml'));

test('CONTRATOS: las rutas del código coinciden con OpenAPI', () => {
  const methods = ['get', 'post', 'patch', 'delete', 'put'];
  const expected = [auth, activos, fallas, ordenes].flatMap(doc => Object.entries(doc.paths).flatMap(([path, ops]) => Object.keys(ops).filter(m => methods.includes(m)).map(m => m.toUpperCase() + ' ' + path))).sort();
  const actual = [...read('backend/src/app.ts').matchAll(/app\.(get|post|patch|delete|put)\('([^']+)'/g)]
    .map(([,method,path]) => method.toUpperCase() + ' ' + path.replace('/:id', '/{id}')).sort();
  assert.deepEqual(actual, expected);
});
test('CONTRATOS: enums de dominio y YAML coinciden', () => {
  const source = read('backend/src/dominio.ts');
  for (const [name, doc] of [['Rol', auth], ['CriticidadEquipo', activos], ['EstadoEquipo', activos], ['EstadoOrden', ordenes]]) {
    const match = new RegExp('export type ' + name + ' = ([^;]+);').exec(source);
    const values = [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
    assert.deepEqual(values, doc.components.schemas[name].enum);
    if (name === 'CriticidadEquipo') assert.deepEqual(values, fallas.components.schemas[name].enum);
  }
});
test('CONTRATOS: requeridos de auth, equipo y rechazo de campos inesperados', () => {
  assert.deepEqual(auth.components.schemas.LoginSolicitud.required, ['rut','password']);
  assert.deepEqual(activos.components.schemas.ActivoCrearSolicitud.required, ['codigo','nombre','ubicacion','criticidad']);
  assert.equal(esquema('activos','ActivoCrearSolicitud')({codigo:'EQ-0001',nombre:'Bomba',ubicacion:'A',criticidad:'ALTA'}), true);
  assert.equal(esquema('activos','ActivoCrearSolicitud')({codigo:'EQ-ABC',nombre:'Bomba',ubicacion:'A',criticidad:'ALTA'}), false);
  assert.equal(esquema('activos','ActivoCrearSolicitud')({codigo:'EQ-0001',nombre:'Bomba',ubicacion:'A',criticidad:'ALTA',sql:'DROP'}), false);
});
test('CONTRATOS: las respuestas 204 no tienen cuerpo definido', () => {
  assert.equal(auth.paths['/auth/logout'].post.responses['204'].content, undefined);
  assert.equal(activos.paths['/activos/{id}'].delete.responses['204'].content, undefined);
});
