import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <header className="header">
        <img src="/LOGO.jpeg" alt="Logo" className="logo" />
        <div>
          <h1>Herramientas de parseo</h1>
          <p className="tagline">Elegí el formato que necesitás</p>
        </div>
      </header>

      <nav className="cards">
        <Link href="/parseos" className="card-link card-parseos">
          <span className="card-icon">📄</span>
          <h2>Parseos</h2>
          <p>IVA, SUSS, ARCIBA y SICORE GANANCIAS — elegí el formato que necesitás.</p>
        </Link>
        <Link href="/bot/comprobantes" className="card-link card-bot">
          <span className="card-icon">🤖</span>
          <h2>Bot Comprobantes</h2>
          <p>Consultar comprobantes AFIP en lote con seguimiento en vivo.</p>
        </Link>
      </nav>
    </main>
  );
}
