import { Link } from 'react-router'
import { Icono } from './Icono'
import { ListaFallas } from './ListaFallas'

export function InicioTrabajador() {
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Mi inicio</h1>
        <Link className="boton boton-primario" to="/fallas">
          <Icono nombre="falla" /> Reportar nueva falla
        </Link>
      </div>
      <ListaFallas resumen />
    </>
  )
}
