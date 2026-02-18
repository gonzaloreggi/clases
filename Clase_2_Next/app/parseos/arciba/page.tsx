"use client";

import Link from "next/link";

export default function ParseoArcibaChoicePage() {
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
          <h1>Parseo ARCIBA</h1>
          <p className="subtitle">
            Elegí el tipo de parseo para obtener el TXT de retenciones AGIP.
          </p>
        </div>
      </header>

      <nav className="cards arciba-choices">
        <Link href="/parseos/arciba/general" className="card-link card-arciba">
          <span className="card-icon">📋</span>
          <h2>1. Parseo general</h2>
          <p>Sube el consolidado CSV (Arciba) y obtené el TXT para retenciones AGIP.</p>
        </Link>
        <Link href="/parseos/arciba/drogueria-vip" className="card-link card-arciba">
          <span className="card-icon">💊</span>
          <h2>2. Drogueria VIP</h2>
          <p>Sube Retenciones y Percepciones (XLSX) y generá el TXT para retenciones AGIP.</p>
        </Link>
      </nav>
    </main>
  );
}
