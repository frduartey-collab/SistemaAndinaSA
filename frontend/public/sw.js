// El aviso viaja con el worker. No hace falta guardar sesiones, fotos ni respuestas de la API.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET' || peticion.mode !== 'navigate') return
  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin || /^\/(api|uploads)(\/|$)/i.test(url.pathname)) return
  evento.respondWith(fetch(peticion).catch(() => new Response(avisoSinConexion, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })))
})

const avisoSinConexion = `<!doctype html>
<html lang="es-CL">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b3354">
  <title>Sin conexión | SIGEM</title>
  <style>
    :root { color-scheme: light dark; font: 1rem/1.5 system-ui,sans-serif; }
    body { margin: 0; display: grid; min-height: 100vh; place-items: center; }
    main { max-width: 32rem; padding: 2rem; }
    h1 { line-height: 1.2; }
    a { display: inline-block; padding: .7rem 1.2rem; border-radius: .5rem; background: #0b3354; color: white; }
    a:focus-visible { outline: .2rem solid #1484a8; outline-offset: .2rem; }
  </style>
</head>
<body>
  <main>
    <p>SIGEM</p>
    <h1>Sin conexión</h1>
    <p>Conéctate a internet y vuelve a intentarlo para acceder a tus equipos y órdenes.</p>
    <a href="">Volver a intentar</a>
  </main>
</body>
</html>`
