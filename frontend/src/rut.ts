export function normalizarRut(entrada: string): string {
  const limpio = entrada.trim().toUpperCase().replace(/[.\s]/g, '')
  if (/^[0-9]{7,8}[0-9K]$/.test(limpio)) {
    return limpio.slice(0, -1) + '-' + limpio.slice(-1)
  }
  return limpio
}
