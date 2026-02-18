"use client";

import Link from "next/link";

export default function ParseosHubPage() {
  return (
    <main className="tool-container">
      <Link href="/" className="back-link">
        ← Volver a Herramientas de parseo
      </Link>
      <header className="page-header">
        <Link href="/" className="logo-link">
          <img src="/LOGO.jpeg" alt="Logo" className="page-logo" />
        </Link>
        <div className="page-title-wrap">
          <h1>Parseos</h1>
          <p className="subtitle">
            Elegí el tipo de parseo para obtener el archivo en el formato que necesitás.
          </p>
        </div>
      </header>

      <nav className="cards cards-parseos">
        <Link href="/parseos/iva" className="card-link card-iva">
          <span className="card-icon">📊</span>
          <h2>Parseo IVA</h2>
          <p>Excel (XLSX) → CSV formateado para importación IVA.</p>
        </Link>
        <Link href="/parseos/suss" className="card-link card-suss">
          <span className="card-icon">📄</span>
          <h2>Parseo SUSS</h2>
          <p>CSV → TXT con el formato requerido para SUSS.</p>
        </Link>
        <Link href="/parseos/arciba" className="card-link card-arciba">
          <span className="card-icon">📋</span>
          <h2>Parseo ARCIBA</h2>
          <p>CSV consolidado Arciba → TXT para retenciones AGIP.</p>
        </Link>
        <Link href="/parseos/sicore-ganancias" className="card-link card-sicore">
          <span className="card-icon">📑</span>
          <h2>Parseo SICORE GANANCIAS</h2>
          <p>CSV retenciones ganancias → TXT SICORE.</p>
        </Link>
      </nav>
    </main>
  );
}
