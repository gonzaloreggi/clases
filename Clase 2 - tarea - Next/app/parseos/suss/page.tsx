"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";
import { parseAmount } from "@/lib/parseoUtils";

const AMOUNT_WIDTH = 15;

function sussTransform(_headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "";
  return rows
    .map((row) => {
      const cuit = String(row[0] ?? "").trim();
      const fecha = String(row[5] ?? "").trim();
      const numeroCert = String(row[4] ?? "").trim();
      const importeNum = parseAmount(row[6]);
      const importeFormatted = importeNum.toFixed(2);
      const importePadded = importeFormatted.padStart(AMOUNT_WIDTH, " ");
      return cuit + fecha + numeroCert + importePadded;
    })
    .join("\n");
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
