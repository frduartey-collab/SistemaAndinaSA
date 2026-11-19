import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import { parseDocument } from 'yaml';
import type { ConsultaActivos, ConsultaFallas, ConsultaOrdenes, ConsultaTecnicos } from './dominio.js';
import { ErrorAPI } from './errores.js';

type Contrato = 'auth' | 'activos' | 'fallas' | 'ordenes';
interface Documento { components: { schemas: Record<string, object> } }
const ajv = new Ajv2020({ strict: false, strictNumbers: true, allErrors: true });
const addFormats = createRequire(import.meta.url)('ajv-formats') as (instance: Ajv2020) => void;
addFormats(ajv);
const cache = new Map<string, ValidateFunction>();

export function esquema(contrato: Contrato, nombre: string): ValidateFunction {
  const key = `${contrato}:${nombre}`;
  const found = cache.get(key);
  if (found) return found;
  const url = new URL(`../../docs/sprint-1/02-contratos-api/${contrato}.openapi.yaml`, import.meta.url);
  const yaml = parseDocument(readFileSync(url, 'utf8'), { uniqueKeys: true });
  if (yaml.errors.length) throw new Error('Contrato YAML inválido: ' + yaml.errors[0].message);
  const doc = yaml.toJSON() as Documento;
  if (!doc.components.schemas[nombre]) throw new Error('Esquema no encontrado: ' + key);
  const defs = JSON.parse(JSON.stringify(doc.components.schemas).replaceAll('#/components/schemas/', '#/$defs/')) as Record<string, object>;
  const validate = ajv.compile({ $defs: defs, $ref: '#/$defs/' + nombre });
  cache.set(key, validate);
  return validate;
}

export function solicitud<T>(contrato: Contrato, nombre: string, raw: unknown): T {
  const accepted = Boolean(esquema(contrato, nombre)(raw));
  if (!accepted) {
    if (contrato === 'activos' && nombre === 'ActivoCrearSolicitud' && typeof raw === 'object' && raw !== null && 'codigo' in raw
        && (typeof raw.codigo !== 'string' || !/^EQ-[0-9]{4}$/.test(raw.codigo))) {
      throw new ErrorAPI(400, 'CODIGO_FORMATO_INVALIDO', 'El código debe tener el formato EQ-0000.');
    }
    if (contrato === 'auth' && typeof raw === 'object' && raw !== null && 'rut' in raw
        && (typeof raw.rut !== 'string' || !/^[0-9]{7,8}-[0-9Kk]$/.test(raw.rut))) {
      throw new ErrorAPI(400, 'RUT_INVALIDO', 'El RUT no tiene un formato válido.');
    }
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La solicitud no cumple el contrato.');
  }
  return raw as T;
}

export function idPositivo(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'El identificador debe ser un entero positivo.');
  }
  return Number(value);
}

function validarConsulta<T extends { page: number; size: number }>(
  contrato: Contrato, nombre: string, query: Record<string, unknown>,
): T {
  function entero(raw: unknown, defecto: number): number {
    if (raw === undefined) return defecto;
    if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) {
      throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'page y size deben ser enteros positivos.');
    }
    return Number(raw);
  }
  const value = solicitud<T>(contrato, nombre, {
    ...query, page: entero(query.page, 1), size: entero(query.size, 20),
  });
  if (!Number.isSafeInteger((value.page - 1) * value.size)) {
    throw new ErrorAPI(400, 'DATOS_INVALIDOS', 'La página está fuera de rango.');
  }
  return value;
}

/** Normaliza solo los enteros HTTP; los demás filtros se validan desde OpenAPI. */
export function consultaActivos(query: Record<string, unknown>): ConsultaActivos {
  return validarConsulta<ConsultaActivos>('activos', 'ConsultaActivos', query);
}

export function consultaFallas(query: Record<string, unknown>): ConsultaFallas {
  const filtro = query.sin_orden;
  const sin_orden = filtro === 'true' ? true : filtro === 'false' ? false : filtro;
  return validarConsulta<ConsultaFallas>('fallas', 'ConsultaFallas', { ...query, sin_orden });
}

export function consultaOrdenes(query: Record<string, unknown>): ConsultaOrdenes {
  const filtro = query.solo_abiertas;
  const solo_abiertas = filtro === 'true' ? true : filtro === 'false' ? false : filtro;
  return validarConsulta<ConsultaOrdenes>('ordenes', 'ConsultaOrdenes', { ...query, solo_abiertas });
}

export function consultaTecnicos(query: Record<string, unknown>): ConsultaTecnicos {
  return validarConsulta<ConsultaTecnicos>('ordenes', 'ConsultaTecnicos', query);
}
