import type { FotoFallaSolicitud, TipoFotoFalla } from '../../backend/src/dominio'

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const satisfies readonly TipoFotoFalla[]
export const MAX_FOTOS_FALLA = 3
export const MAX_BYTES_FOTO = 5 * 1024 * 1024

export type FotoSeleccionada = {
  clave: string
  archivo: File
  tipo: TipoFotoFalla
  nombre: string
}

export function esFotoCompatible(tipo: string): tipo is TipoFotoFalla {
  return TIPOS_FOTO.some((permitido) => permitido === tipo)
}

export function nombreFoto(nombre: string) {
  const limpio = Array.from(nombre, (caracter) => {
    const codigo = caracter.charCodeAt(0)
    return caracter === '/' || caracter === '\\' || codigo < 32 || codigo === 127 ? '-' : caracter
  }).join('').trim()

  return Array.from(limpio).slice(0, 180).join('') || 'Fotografía'
}

export function prepararFoto({ archivo, nombre, tipo }: FotoSeleccionada): Promise<FotoFallaSolicitud> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    const error = new Error('No se pudo leer la fotografía «' + nombre + '». Quítala y vuelve a adjuntarla.')
    lector.onerror = () => rechazar(error)
    lector.onabort = () => rechazar(error)
    lector.onload = () => {
      const contenido = typeof lector.result === 'string' ? lector.result.split(',')[1] : undefined
      if (contenido) {
        resolver({ nombre, tipo, contenido_base64: contenido })
      } else {
        rechazar(error)
      }
    }
    lector.readAsDataURL(archivo)
  })
}
