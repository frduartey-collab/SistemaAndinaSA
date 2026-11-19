const trazos = {
  inicio: 'M3 10 12 3l9 7m-2-2v13h-5v-6h-4v6H5V8',
  equipo: 'M5 7h11v11H5zM2 10h3m-3 5h3m6-8V4m-3 0h6m2 6h3l2 2v4h-5m-8 2v2m6-2v2m-6-8 2 2 3-4',
  inventario: 'M3 8l9 4 9-4M12 12v9M3 8v9l9 4 9-4V8l-9-4zM8 6l9 4',
  falla: 'M10.4 4.4a1.8 1.8 0 0 1 3.2 0l7.6 13.1a1.8 1.8 0 0 1-1.6 2.7H4.4a1.8 1.8 0 0 1-1.6-2.7zM13 8l-4 5h3l-1 4 4-5h-3z',
  orden: 'M7 4H5v17h14V4h-2M9 3h6v4H9zM8 11h2m2 0h4m-8 4h2m2 0h4m-8 3h2m2 0h4',
  cuenta: 'M15 16a6 6 0 0 0-12 0v3h12m3-11v8m-4-4h8M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ajustes: 'M10 3h4l.6 2.4 1.6.9 2.4-.7 2 3.5-1.8 1.7v1.8l1.8 1.7-2 3.5-2.4-.7-1.6.9-.6 2.4h-4l-.6-2.4-1.6-.9-2.4.7-2-3.5 1.8-1.7v-1.8L3.4 9.1l2-3.5 2.4.7 1.6-.9zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  salir: 'M10 5H4v14h6m5-11 4 4-4 4m-7-4h11',
  entrar: 'M14 5h6v14h-6m-3-11 4 4-4 4m-7-4h11',
  buscar: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM15 15l6 6',
  filtros: 'M3 5h18l-7 8v5l-4 2v-7z',
  limpiar: 'M3 5h18l-7 8v5l-4 2v-7zM4 21 20 3',
  sincronizar: 'M20 4v5h-5m-11 11v-5h5M20 9A8 8 0 0 0 6 6L4 9m0 6a8 8 0 0 0 14 3l2-3',
  ver: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ocultar: 'M3 3l18 18M10 6.2a11 11 0 0 1 2-.2c6.4 0 10 6 10 6a16 16 0 0 1-2.6 3.1M17 17a11 11 0 0 1-5 1c-6.4 0-10-6-10-6s1.6-2.7 4.6-4.4m3.3 2.3a3 3 0 0 0 4.2 4.2',
  crear: 'M12 5v14M5 12h14',
  ordenNueva: 'M7 4H5v17h10M9 3h6v4H9zm8 1h2v8M8 11h7m-7 4h4m6 0v6m-3-3h6',
  editar: 'm4 16-1 5 5-1L20 8l-4-4zm10-10 4 4M3 21l1-5',
  baja: 'M4 5h16v4H4zm2 4v11h12V9m-6 2v6m-3-3 3 3 3-3',
  foto: 'M3 7h4l2-3h6l2 3h4v13H3zM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  cerrar: 'm6 6 12 12M18 6 6 18',
  guardar: 'M4 3h13l3 3v15H4zM8 3v6h7V3m-7 18v-7h8v7',
  anterior: 'm15 5-7 7 7 7',
  siguiente: 'm9 5 7 7-7 7',
  iniciar: 'M7 4v16l13-8z',
  completar: 'm7 12 3 3 7-7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  pendiente: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  progreso: 'M20 4v5h-5m-11 11v-5h5M20 9A8 8 0 0 0 6 6L4 9m0 6a8 8 0 0 0 14 3l2-3',
  cambiar: 'M4 8h16l-4-4m4 12H4l4 4',
} as const

type NombreIcono = keyof typeof trazos

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={trazos[nombre]} />
    </svg>
  )
}
