"use client";

import Link from "next/link";

export default function ParseoIvaChoicePage() {
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
          <h1>Parseo IVA</h1>
          <p className="subtitle">
            Elegí el tipo de parseo para obtener el CSV en el formato definido.
          </p>
        </div>
      </header>

      <nav className="cards">
        <Link href="/parseos/iva/general" className="card-link card-iva">
          <span className="card-icon">📋</span>
          <h2>1. Parseo general</h2>
          <p>Sube un archivo XLSX (Excel) y obtené el CSV con el formato definido.</p>
        </Link>
        <Link href="/parseos/iva/cuadro-compras" className="card-link card-iva">
          <span className="card-icon">💵</span>
          <h2>2. Parseo cuadro compras</h2>
          <p>Mismo formato de salida con un diseño de entrada adaptado al cuadro de compras.</p>
        </Link>
      </nav>
    </main>
  );
}
