"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";

async function sicoreTransform(headers: string[], rows: unknown[][]): Promise<string> {
  const response = await fetch("/api/parseos/sicore-ganancias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ headers, rows }),
  });

  if (!response.ok) {
    throw new Error("Error al procesar los datos");
  }

  const data = await response.json();
  return data.result;
}

const config: ParseoConfig = {
  title: "Parseo SICORE GANANCIAS",
  subtitle: (
    <>
      Sube el CSV de retenciones ganancias y obtené el TXT para SICORE.{" "}
      <span className="hide-text">
        Al final de cada línea: aamm + número de línea (ej. 261201 = aa 26, mm 12, 01).
      </span>
    </>
  ),
  inputFormat: "csv",
  inputLabel: "CSV",
  inputAccept: ".csv,text/csv",
  outputLabel: "TXT",
  outputFileName: "parseado_retenciones_ganancias.txt",
  outputMimeType: "text/plain;charset=utf-8",
  generateDescription: "El archivo TXT se generará con el formato SICORE (retenciones ganancias).",
  transform: sicoreTransform,
};

export default function ParseoSicoreGananciasPage() {
  return <ParseoPageLayout config={config} />;
}
