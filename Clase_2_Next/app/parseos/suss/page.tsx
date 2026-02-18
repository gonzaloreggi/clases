"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";

async function sussTransform(headers: string[], rows: unknown[][]): Promise<string> {
  const response = await fetch("/api/parseos/suss", {
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
  title: "Parseo SUSS",
  subtitle: "Sube un archivo CSV y obtén un TXT con el formato definido.",
  inputFormat: "csv",
  inputLabel: "CSV",
  inputAccept: ".csv,text/csv",
  outputLabel: "TXT",
  outputFileName: "salida.txt",
  outputMimeType: "text/plain;charset=utf-8",
  generateDescription: "El archivo TXT se generará con el formato que definamos.",
  transform: sussTransform,
};

export default function ParseoSussPage() {
  return <ParseoPageLayout config={config} />;
}
