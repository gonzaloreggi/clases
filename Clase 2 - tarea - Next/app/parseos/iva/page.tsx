"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";

async function ivaTransform(headers: string[], rows: unknown[][]): Promise<string> {
  const response = await fetch("/api/parseos/iva", {
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
  title: "Parseo IVA",
  subtitle: "Sube un archivo XLSX (Excel) y obtén un CSV con el formato definido.",
  inputFormat: "xlsx",
  inputLabel: "XLSX",
  inputAccept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  outputLabel: "CSV",
  outputFileName: "salida_iva.csv",
  outputMimeType: "text/csv;charset=utf-8",
  generateDescription: "El archivo CSV se generará con el formato IVA.",
  transform: ivaTransform,
};

export default function ParseoIvaPage() {
  return <ParseoPageLayout config={config} />;
}
