"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";

async function arcibaTransform(headers: string[], rows: unknown[][]): Promise<string> {
  const response = await fetch("/api/parseos/arciba", {
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
  title: "Parseo ARCIBA",
  subtitle: "Sube el consolidado CSV (Arciba) y obtené el TXT para retenciones AGIP.",
  backLink: { href: "/parseos/arciba", label: "Volver a Parseo ARCIBA" },
  inputFormat: "csv",
  inputLabel: "CSV",
  inputAccept: ".csv,text/csv",
  outputLabel: "TXT",
  outputFileName: "parseado_retenciones_agip.txt",
  outputMimeType: "text/plain;charset=utf-8",
  generateDescription: "El archivo TXT se generará con el formato AGIP (retenciones).",
  transform: arcibaTransform,
};

export default function ParseoArcibaGeneralPage() {
  return <ParseoPageLayout config={config} />;
}
