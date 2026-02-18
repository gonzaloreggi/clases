/**
 * ARCIBA / AGIP retentions TXT output transform.
 * Used by Parseo general (single CSV) and Drogueria VIP (Retenciones + Percepciones XLSX).
 */
import {
  cellDigits,
  cellStr,
  findCol,
  formatNumber,
  normalizeFecha,
  parseAmount,
  sortRowsByFecha,
} from "@/lib/parseoUtils";

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

const CANONICAL_HEADERS = [
  "fecha",
  "interno",
  "num_comp",
  "razon_social",
  "cuit",
  "valor",
  "reten",
  "alicuota",
] as const;

/** Produces AGIP TXT from canonical headers + rows (same output for general and Drogueria VIP). */
export function arcibaTransform(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0 || headers.length === 0) return "";

  const idx = {
    fecha: findCol(headers, "fecha"),
    num_comp: findCol(headers, "num_comp"),
    razon_social: findCol(headers, "razon_social"),
    cuit: findCol(headers, "cuit"),
    valor: findCol(headers, "valor"),
    reten: findCol(headers, "reten"),
    alicuota: findCol(headers, "alicuota"),
    interno: findCol(headers, "interno"),
  };

  const sortedRows = sortRowsByFecha(rows, idx.fecha);

  const lines: string[] = [];
  for (const row of sortedRows) {
    const fechaRaw = cellStr(row, idx.fecha);
    const fecha = normalizeFecha(fechaRaw);
    const num_comp = cellStr(row, idx.num_comp);
    const valorNum = parseAmount(row[idx.valor]);
    const retenNum = parseAmount(row[idx.reten]);
    const alicuotaNum = parseAmount(row[idx.alicuota]);
    const cuit = cellDigits(row, idx.cuit);
    const cuit11 = cuit ? cuit.padStart(11, "0").slice(-11) : "00000000000";
    let razon = cellStr(row, idx.razon_social);
    razon = razon
      .replace(/\s*S\.\s*A\.?/gi, " SA")
      .replace(/\s*S\.\s*R\.\s*L\.?/gi, " SRL")
      .replace(/\s*S\.\s*A\.\s*U\.?/gi, " SAU")
      .trim();
    razon = sanitizeForEarciba(razon);
    const razon30 = padRight(razon, 30);
    const alicuota5 = formatAlicuota5(alicuotaNum);
    const montoComprobante = formatNumber(valorNum, 16, "0");
    const importeOtros = formatNumber(0, 16, "0");
    const importeIva = formatNumber(0, 16, "0");
    const montoSujeto = formatNumber(valorNum, 16, "0");
    const retenPracticada = formatNumber(retenNum, 16, "0");
    const numComp16 = (num_comp || "").padStart(16, "0").slice(-16);
    const internoRaw = idx.interno >= 0 ? String(row[idx.interno] ?? "").trim() : "";
    const condicion = internoRaw === "" ? "1" : internoRaw.slice(0, 1);

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
      condicion,
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

export { CANONICAL_HEADERS };
