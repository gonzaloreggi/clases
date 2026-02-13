"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";
import { findCol, normalizeFecha, parseFechaSortable } from "@/lib/parseoUtils";

function formatNumFixed(num: number | string, len: number): string {
  const n = parseFloat(String(num).replace(",", ".")) || 0;
  const [intPart, decPart] = n.toFixed(2).split(".");
  let s = intPart + "," + (decPart || "00");
  s = s.length > len ? s.slice(-len) : s.padStart(len, " ");
  return s;
}

function sicoreTransform(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0 || headers.length === 0) return "";

  const csvHeaders = headers.map((h) => String(h));
  const idx = {
    fecha: findCol(csvHeaders, "fecha"),
    num_comp: findCol(csvHeaders, "num_comp"),
    punto_venta: findCol(csvHeaders, "punto_venta"),
    cuit: findCol(csvHeaders, "cuit"),
    valor: findCol(csvHeaders, "valor"),
    reten: findCol(csvHeaders, "reten"),
  };

  const sortedRows =
    idx.fecha >= 0
      ? [...rows].sort(
          (a, b) =>
            parseFechaSortable(String(a[idx.fecha] ?? "")) -
            parseFechaSortable(String(b[idx.fecha] ?? ""))
        )
      : rows;

  const lines: string[] = [];
  const firstDate =
    sortedRows.length && idx.fecha >= 0
      ? normalizeFecha(String(sortedRows[0][idx.fecha] ?? ""))
      : "01/01/2025";
  const [, mFirst, yFirst] = firstDate.split("/");
  const yy = (yFirst || "2025").slice(-2);
  const mm = mFirst || "12";
  let lineNum = 1;

  for (const row of sortedRows) {
    const fecha = normalizeFecha(idx.fecha >= 0 ? String(row[idx.fecha] ?? "") : "");
    const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] ?? "").trim() : "";
    const punto_venta = idx.punto_venta >= 0 ? String(row[idx.punto_venta] ?? "").trim() : "";
    const valorNum =
      parseFloat(String(idx.valor >= 0 ? row[idx.valor] ?? "0" : "0").replace(",", ".")) || 0;
    const retenNum =
      parseFloat(String(idx.reten >= 0 ? row[idx.reten] ?? "0" : "0").replace(",", ".")) || 0;
    const cuit = idx.cuit >= 0 ? String(row[idx.cuit] ?? "").replace(/\D/g, "") : "";
    const numComprobanteDig = ((punto_venta || "") + (num_comp || "")).replace(/\D/g, "") || "0";
    const first = numComprobanteDig.slice(0, 1);
    const rest = numComprobanteDig.slice(1).padStart(5, "0").slice(-5);
    const numComprobante = ("0000" + first + "000" + rest + "   ").slice(0, 16);
    const cuit20 = ((cuit || "") + "                    ").slice(0, 20);
    const lineSeq = String(lineNum).padStart(2, "0");
    const year = (yFirst || "2025").slice(-4);
    const certVal = year + yy + mm + lineSeq;
    const certificado = ("000000000000000000" + certVal).slice(-28);
    const fecha10 = (fecha + "          ").slice(0, 10);

    const line =
      "01" +
      fecha10 +
      numComprobante +
      formatNumFixed(valorNum, 16) +
      "0217" +
      "078" +
      "1" +
      formatNumFixed(valorNum, 14) +
      fecha10 +
      "01" +
      "0" +
      formatNumFixed(retenNum, 14) +
      "  0,00" +
      "          " +
      "80" +
      cuit20 +
      certificado;

    lines.push(line);
    lineNum++;
  }
  return lines.join("\r\n") + "\r\n";
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
