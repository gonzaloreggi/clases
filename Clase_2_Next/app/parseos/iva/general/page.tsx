"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";

async function ivaTransform(headers: string[], rows: unknown[][]): Promise<string> {
  const response = await fetch("/api/parseos/iva", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ headers, rows }),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg =
      data.missingColumns?.length > 0
        ? `Faltan columnas requeridas: ${data.missingColumns.join(", ")}. ${data.hint ?? ""}`
        : data.error ?? "Error al procesar los datos";
    throw new Error(msg);
  }

  return data.result;
}

const config: ParseoConfig = {
  title: "Parseo IVA",
  subtitle: "Sube un archivo XLSX (Excel) y obtén un CSV con el formato definido.",
  backLink: { href: "/parseos/iva", label: "Volver a Parseo IVA" },
  inputFormat: "xlsx",
  inputLabel: "XLSX",
  inputAccept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  outputLabel: "CSV",
  outputFileName: "salida_iva.csv",
  outputMimeType: "text/csv;charset=utf-8",
  generateDescription: "El archivo CSV se generará con el formato IVA.",
  transform: ivaTransform,
};

export default function ParseoIvaGeneralPage() {
  return <ParseoPageLayout config={config} />;
}
