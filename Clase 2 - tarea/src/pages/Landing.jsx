import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="landing">
      <header className="header">
        <img src="/LOGO.jpeg" alt="Logo" className="logo" />
        <div>
          <h1>Herramientas de parseo</h1>
          <p className="tagline">Elegí el formato que necesitás</p>
        </div>
      </header>

      <p className="thanks-tomacin">GRACIAS POR TU AYUDA TOMACIN!!!</p>

      <nav className="cards">
        <Link to="/parseo-iva" className="card-link card-iva">
          <span className="card-icon">📊</span>
          <h2>Parseo IVA</h2>
          <p>Excel (XLSX) → CSV formateado para importación IVA.</p>
        </Link>
        <Link to="/parseo-suss" className="card-link card-suss">
          <span className="card-icon">📄</span>
          <h2>Parseo SUSS</h2>
          <p>CSV → TXT con el formato requerido para SUSS.</p>
        </Link>
        <Link to="/parseo-arciba" className="card-link card-arciba">
          <span className="card-icon">📋</span>
          <h2>Parseo ARCIBA</h2>
          <p>CSV consolidado Arciba → TXT para retenciones AGIP.</p>
        </Link>
        <Link to="/parseo-sicore-ganancias" className="card-link card-sicore">
          <span className="card-icon">📑</span>
          <h2>Parseo SICORE GANANCIAS</h2>
          <p>CSV retenciones ganancias → TXT SICORE.</p>
        </Link>
      </nav>
    </main>
  );
}
