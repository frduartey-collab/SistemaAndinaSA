export function normalizarRut(entrada: string): string {
  const limpio = entrada.trim().toUpperCase().replace(/[.\s]/g, '');
  if (/^[0-9]{7,8}[0-9K]$/.test(limpio)) {
    return limpio.slice(0, -1) + '-' + limpio.slice(-1);
  }
  return limpio;
}

/** Comprueba el dígito verificador con pesos de 2 a 7, de derecha a izquierda. */
export function rutValido(valor: string): boolean {
  if (!/^[0-9]{7,8}-[0-9Kk]$/.test(valor)) return false;
  const [numero, verificador] = valor.toUpperCase().split('-');
  if (Number(numero) === 0) return false;

  let suma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    suma += Number(numero[i]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const resultado = 11 - (suma % 11);
  const esperado = resultado === 11 ? '0' : resultado === 10 ? 'K' : String(resultado);
  return verificador === esperado;
}
