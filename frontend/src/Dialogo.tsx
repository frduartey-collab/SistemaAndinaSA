import { Icono } from './Icono'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'

type PropsDialogo = {
  titulo: string
  ocupado?: boolean
  amplio?: boolean
  alCerrar: () => void
  children: ReactNode
}

export function Dialogo({ titulo, ocupado = false, amplio = false, alCerrar, children }: PropsDialogo) {
  const ref = useRef<HTMLDialogElement>(null)
  const encabezado = useRef<HTMLHeadingElement>(null)
  const tituloId = useId()

  useLayoutEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    const origen = document.activeElement
    dialogo.showModal()
    encabezado.current?.focus()
    return () => {
      dialogo.close()
      if (origen instanceof HTMLElement && origen.isConnected) {
        origen.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={amplio ? 'dialogo dialogo-amplio' : 'dialogo'}
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault()
        if (!ocupado) alCerrar()
      }}
    >
      <div className="dialogo-cabecera">
        <h2 id={tituloId} tabIndex={-1} ref={encabezado}>{titulo}</h2>
        <button
          className="boton boton-icono"
          type="button"
          aria-label="Cerrar diálogo"
          disabled={ocupado}
          onClick={alCerrar}
        >
          <Icono nombre="cerrar" />
        </button>
      </div>
      {children}
    </dialog>
  )
}

