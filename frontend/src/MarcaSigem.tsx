export function MarcaSigem() {
  return (
    <div className="marca-sigem">
      <svg className="marca-sigem-icono" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="62" height="62" rx="15" fill="var(--logo-fondo, #0b3354)" stroke="var(--logo-borde, #256387)" strokeWidth="2" />
        <path d="M39 13a12 12 0 0 0-12 15l-12 12a6 6 0 0 0 8.5 8.5l12-12a12 12 0 0 0 15-12l-7 7-6-1-1-6 7-7a12 12 0 0 0-4.5-4.5Z" fill="var(--logo-herramienta, #eff8ff)" />
        <circle cx="19.5" cy="44" r="2" fill="var(--logo-fondo, #0b3354)" />
        <path d="M40 47h10m-5-5v10" fill="none" stroke="var(--logo-acento, #66e1f3)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="marca-sigem-texto">
        <strong>SIGEM</strong>
        <span>Manufacturas Andina S.A.</span>
      </span>
    </div>
  )
}
