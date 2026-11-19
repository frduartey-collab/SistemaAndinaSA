export class ErrorApi extends Error {
  readonly estado: number
  readonly codigo: string | undefined
  readonly reintentarEn: number | undefined

  constructor(mensaje: string, estado: number, codigo?: string, reintentarEn?: number) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.codigo = codigo
    this.reintentarEn = reintentarEn
  }
}

export function mensajeError(error: unknown, alternativa: string) {
  return error instanceof ErrorApi ? error.message : alternativa
}

export async function llamarApi<T>(
  ruta: "/auth/login" | "/auth/register" | "/auth/me" | "/auth/logout" | "/activos" | `/activos?${string}` | `/activos/${number}` | "/fallas" | `/fallas?${string}`
    | "/ordenes" | `/ordenes?${string}` | `/ordenes/${number}` | `/ordenes/${number}/estado` | `/ordenes/${number}/cierre` | `/ordenes/tecnicos?${string}`
    | "/repuestos" | `/repuestos?${string}` | `/repuestos/${number}` | `/repuestos/${number}/movimientos`,
  opciones: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(opciones.headers)
  headers.set('Accept', 'application/json')
  if (opciones.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', 'Bearer ' + token)

  let respuesta: Response
  try {
    respuesta = await fetch('/api' + ruta, { ...opciones, headers, cache: 'no-store' })
  } catch (error) {
    if (opciones.signal?.aborted) throw error
    throw new ErrorApi('No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.', 0)
  }

  if (!respuesta.ok) {
    const cuerpo: unknown = await respuesta.json().catch(() => null)
    const mensaje = typeof cuerpo === 'object' && cuerpo && 'mensaje' in cuerpo
      && typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : 'No se pudo completar la solicitud.'
    const codigo = typeof cuerpo === 'object' && cuerpo && 'codigo' in cuerpo
      && typeof cuerpo.codigo === 'string' ? cuerpo.codigo : undefined
    const segundos = Number(respuesta.headers.get('Retry-After'))
    const reintentarEn = Number.isFinite(segundos) && segundos > 0 ? segundos : undefined

    throw new ErrorApi(mensaje, respuesta.status, codigo, reintentarEn)
  }

  if (respuesta.status === 204) return undefined as T

  try {
    return await respuesta.json() as T
  } catch (error) {
    if (opciones.signal?.aborted) throw error
    throw new ErrorApi('El servidor devolvió una respuesta que no se pudo leer.', respuesta.status)
  }
}

