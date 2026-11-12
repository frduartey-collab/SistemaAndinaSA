import type { CodigoError } from './dominio.js';

export class ErrorAPI extends Error {
  constructor(readonly status: number, readonly codigo: CodigoError, message: string) {
    super(message);
  }
}
