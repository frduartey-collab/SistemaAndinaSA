import { rutaDatos } from './db.js';
import { Datos } from './datos.js';

const entrada = process.argv[2] ?? '';
const id = Number(entrada);
if (!/^[1-9][0-9]*$/.test(entrada) || !Number.isSafeInteger(id) || process.argv.length !== 3) {
  throw new Error('Uso: npm run tenant:empresa -- <id del cliente>');
}

const datos = new Datos(rutaDatos());
try {
  datos.transaccion(() => {
    const cliente = datos.tenantPorId(id);
    if (!cliente || cliente.estado !== 'ACTIVO') throw new Error('El cliente no existe o está inactivo.');
    datos.db.prepare("UPDATE tenants SET plan = 'EMPRESA' WHERE id = ?").run(id);
    console.log('Cliente #' + id + ' habilitado para el plan Empresa.');
  });
} finally {
  datos.close();
}
