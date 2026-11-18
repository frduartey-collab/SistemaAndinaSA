import { Icono } from './Icono'
import { useState } from 'react'
import type { ActivoRespuesta } from '../../backend/src/dominio'
import { useAuth } from './AuthContext'
import { Dialogo } from './Dialogo'
import { mensajeError } from './api'

type PropsBaja = {
  equipo: ActivoRespuesta
  alCerrar: () => void
  alDarDeBaja: (mensaje: string) => void
}

export function BajaEquipo({ equipo, alCerrar, alDarDeBaja }: PropsBaja) {
  const { solicitar, puedeEscribir } = useAuth()
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    if (procesando || !puedeEscribir) return
    setProcesando(true)
    setError('')

    try {
      await solicitar<void>(`/activos/${equipo.id}`, { method: 'DELETE' })
    } catch (fallo) {
      setError(mensajeError(fallo, 'No se pudo dar de baja el equipo. Inténtalo de nuevo.'))
      return
    } finally {
      setProcesando(false)
    }

    alDarDeBaja('Equipo ' + equipo.codigo + ' dado de baja. Su código sigue reservado.')
  }

  return (
    <Dialogo titulo="Dar de baja equipo" ocupado={procesando} alCerrar={alCerrar}>
      <div aria-busy={procesando}>
        <p>¿Dar de baja <strong>{equipo.codigo} · {equipo.nombre}</strong>?</p>
        <p>El equipo dejará de aparecer en el catálogo. Su código seguirá reservado.</p>
        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        <div className="dialogo-acciones">
          <button className="boton boton-secundario" type="button" onClick={alCerrar} disabled={procesando}>Cancelar</button>
          <button className="boton boton-peligro" type="button" onClick={confirmar} disabled={procesando || !puedeEscribir}>
            <Icono nombre="baja" />
            {procesando ? 'Dando de baja…' : 'Dar de baja'}
          </button>
        </div>
      </div>
    </Dialogo>
  )
}

