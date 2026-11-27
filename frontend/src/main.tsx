import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './AuthProvider'
import { TemaInterfaz } from './TemaInterfaz'
import './estilos.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TemaInterfaz>
          <App />
        </TemaInterfaz>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
    console.warn('No se pudo activar el modo sin conexión de SIGEM.')
  })
}
