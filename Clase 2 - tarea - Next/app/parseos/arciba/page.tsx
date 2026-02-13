"use client";

import ParseoPageLayout, { type ParseoConfig } from "@/components/ParseoPageLayout";
import { findCol, normalizeFecha, parseFechaSortable } from "@/lib/parseoUtils";

function formatNum16(num: number | string): string {
  const n = parseFloat(String(num).replace(",", ".")) || 0;
  const [intPart, decPart] = n.toFixed(2).split(".");
  return intPart.padStart(13, "0") + "," + (decPart || "00");
}

function sanitizeForEarciba(s: string): string {
  const map: Record<string, string> = {
    á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", ü: "u",
    Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N", Ü: "U",
    à: "a", è: "e", ì: "i", ò: "o", ù: "u", â: "a", ê: "e", î: "i", ô: "o", û: "u",
    ã: "a", õ: "o", ç: "c", Ç: "C",
  };
  let t = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
  return t.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function formatAlicuota5(alicuotaNum: number | string): string {
  const a = parseFloat(String(alicuotaNum)) || 0;
  const intPart = Math.min(99, Math.floor(a));
  const decPart = Math.min(99, Math.round((a % 1) * 100));
  return String(intPart).padStart(2, "0") + "," + String(decPart).padStart(2, "0");
}

function padRight(s: string, len: number): string {
  let t = String(s || "")
    .trim()
    .replace(/\s*S\.\s*A\.?/gi, " SA")
    .replace(/\s*S\.\s*R\.\s*L\.?/gi, " SRL")
    .replace(/\s*S\.\s*A\.\s*U\.?/gi, " SAU");
  t = t.replace(/\.\s*$/, "").trim().slice(0, len);
  return t.padEnd(len, " ");
}

function arcibaTransform(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0 || headers.length === 0) return "";

  const csvHeaders = headers.map((h) => String(h));
  const idx = {
    fecha: findCol(csvHeaders, "fecha"),
    num_comp: findCol(csvHeaders, "num_comp"),
    razon_social: findCol(csvHeaders, "razon_social"),
    cuit: findCol(csvHeaders, "cuit"),
    valor: findCol(csvHeaders, "valor"),
    reten: findCol(csvHeaders, "reten"),
    alicuota: findCol(csvHeaders, "alicuota"),
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
  for (const row of sortedRows) {
    const fechaRaw = idx.fecha >= 0 ? String(row[idx.fecha] ?? "").trim() : "";
    const fecha = normalizeFecha(fechaRaw);
    const num_comp = idx.num_comp >= 0 ? String(row[idx.num_comp] ?? "").trim() : "";
    const valorNum = parseFloat(String(idx.valor >= 0 ? row[idx.valor] ?? "0" : "0").replace(",", ".")) || 0;
    const retenNum = parseFloat(String(idx.reten >= 0 ? row[idx.reten] ?? "0" : "0").replace(",", ".")) || 0;
    const alicuotaNum = parseFloat(String(idx.alicuota >= 0 ? row[idx.alicuota] ?? "0" : "0").replace(",", ".")) || 0;
    const cuit = idx.cuit >= 0 ? String(row[idx.cuit] ?? "").replace(/\D/g, "") : "";
    const cuit11 = cuit ? cuit.padStart(11, "0").slice(-11) : "00000000000";
    let razon = idx.razon_social >= 0 ? String(row[idx.razon_social] ?? "").trim() : "";
    razon = razon
      .replace(/\s*S\.\s*A\.?/gi, " SA")
      .replace(/\s*S\.\s*R\.\s*L\.?/gi, " SRL")
      .replace(/\s*S\.\s*A\.\s*U\.?/gi, " SAU")
      .trim();
    razon = sanitizeForEarciba(razon);
    const razon30 = padRight(razon, 30);
    const alicuota5 = formatAlicuota5(alicuotaNum);
    const montoComprobante = formatNum16(valorNum);
    const importeOtros = formatNum16(0);
    const importeIva = formatNum16(0);
    const montoSujeto = formatNum16(valorNum);
    const retenPracticada = formatNum16(retenNum);
    const numComp16 = (num_comp || "").padStart(16, "0").slice(-16);

    const line = [
      "1",
      "029",
      fecha,
      "01",
      "A",
      numComp16,
      fecha,
      montoComprobante,
      "                ",
      "3",
      cuit11,
      "4",
      "00000000000",
      "1",
      razon30,
      importeOtros,
      importeIva,
      montoSujeto,
      alicuota5,
      retenPracticada,
      retenPracticada,
      " ",
      " ".repeat(10),
    ].join("");
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

const config: ParseoConfig = {
  title: "Parseo ARCIBA",
  subtitle: "Sube el consolidado CSV (Arciba) y obtené el TXT para retenciones AGIP.",
  inputFormat: "csv",
  inputLabel: "CSV",
  inputAccept: ".csv,text/csv",
  outputLabel: "TXT",
  outputFileName: "parseado_retenciones_agip.txt",
  outputMimeType: "text/plain;charset=utf-8",
  generateDescription: "El archivo TXT se generará con el formato AGIP (retenciones).",
  transform: arcibaTransform,
};

export default function ParseoArcibaPage() {
  return <ParseoPageLayout config={config} />;
}
