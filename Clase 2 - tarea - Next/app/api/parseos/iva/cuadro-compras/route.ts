import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { findCol, findColContaining, parseAmountArgentine } from "@/lib/parseoUtils";

/**
 * Cuadro compras input format (e.g. COMGLO0126.xlsx):
 * - Headers in row 5: FECHA, TIPO COMP., PTO. VTA., NRO. COMP., CUIT, ..., PERC. IVA, ...
 * - Data from row 6. PERC. IVA uses Argentine format (e.g. 4.463,49).
 * - Discard rows where PERC. IVA is 0 or empty. Skip TOTALES row.
 * - Output: same CSV as IVA general.
 */

function findColByNames(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = findCol(headers, name);
    if (idx >= 0) return idx;
  }
  const part = names[0]?.split(/[\s.]/)[0];
  if (part) {
    const idx = findColContaining(headers, part);
    if (idx >= 0) return idx;
  }
  return -1;
}

function escapeCsvField(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Format number for import: no thousands separator, comma as decimal (e.g. 4463,49). Same as IVA general. */
function formatImporteForImport(num: number): string {
  const [intPart, decPart] = num.toFixed(2).split(".");
  return intPart + "," + (decPart ?? "00");
}

/** Output date as aaaa-mm-dd (yyyy-mm-dd) for the validator. */
function formatDateYYYYMMDD(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return [y!, m!.padStart(2, "0"), d!.padStart(2, "0")].join("-");
  }
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) return s.replace(/[\/\-]/g, "-");
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) {
    try {
      if (XLSX.SSF?.parse_date_code) {
        const date = XLSX.SSF.parse_date_code(n);
        if (date && date.y != null) {
          const d = date.d;
          const m = date.m;
          const y = date.y;
          return [y, String(m).padStart(2, "0"), String(d).padStart(2, "0")].join("-");
        }
      }
    } catch {
      // fallback
    }
  }
  return s;
}

/** New input column names (row 5 headers). */
const CUADRO_HEADERS = {
  fecha: ["FECHA", "Fecha"],
  puntoVenta: ["PTO. VTA.", "PTO. VTA", "Pto. Vta.", "Punto de Venta"],
  numeroComprobante: ["NRO. COMP.", "NRO. COMP", "Nro. Comp.", "Número de Comprobante", "NUMERO DE COMPROBANTE"],
  cuit: ["CUIT", "Cuit"],
  percIva: ["PERC. IVA", "PERC. IVA.", "PERC IVA", "Perc. Iva", "Percepción IVA"],
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { headers, rows } = body;

    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Missing or invalid headers/rows" },
        { status: 400 }
      );
    }

    const idxFecha = findColByNames(headers, [...CUADRO_HEADERS.fecha]);
    const idxPtoVta = findColByNames(headers, [...CUADRO_HEADERS.puntoVenta]);
    const idxNroComp = findColByNames(headers, [...CUADRO_HEADERS.numeroComprobante]);
    const idxCuit = findColByNames(headers, [...CUADRO_HEADERS.cuit]);
    const idxPercIva = findColByNames(headers, [...CUADRO_HEADERS.percIva]);

    const missing: string[] = [];
    if (idxFecha < 0) missing.push("FECHA");
    if (idxPtoVta < 0) missing.push("PTO. VTA.");
    if (idxNroComp < 0) missing.push("NRO. COMP.");
    if (idxCuit < 0) missing.push("CUIT");
    if (idxPercIva < 0) missing.push("PERC. IVA");

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Faltan columnas del cuadro de compras.",
          missingColumns: missing,
          hint: "El archivo debe tener encabezados en la fila 5: FECHA, PTO. VTA., NRO. COMP., CUIT, PERC. IVA.",
        },
        { status: 400 }
      );
    }

    const delimiter = ";";
    const lines: string[] = [];

    for (const row of rows) {
      const firstCell = String(row[0] ?? "").trim().toUpperCase();
      if (firstCell === "TOTALES" || firstCell.includes("TOTALES")) {
        continue;
      }

      const percIvaRaw = row[idxPercIva];
      const percIvaStr = String(percIvaRaw ?? "").trim();
      if (percIvaStr === "") continue;
      const percIvaNum = parseAmountArgentine(percIvaRaw);
      if (percIvaNum === 0) continue;

      const cuit = String(row[idxCuit] ?? "").trim();
      const fechaRaw = row[idxFecha];
      const puntoVenta = String(row[idxPtoVta] ?? "").trim();
      const numeroComprobante = String(row[idxNroComp] ?? "").trim();
      const importe = formatImporteForImport(percIvaNum);

      const fecha = formatDateYYYYMMDD(fechaRaw);
      const comprobanteFormateado =
        String(puntoVenta).padStart(5, "0") + "-" + String(numeroComprobante).padStart(8, "0");

      // Same column order as IVA general: 493, cuit, (empty), fecha, 1, comprobante, importe
      const cells = [
        escapeCsvField("493"),
        escapeCsvField(cuit),
        "",
        escapeCsvField(fecha),
        "1",
        escapeCsvField(comprobanteFormateado),
        escapeCsvField(importe),
      ];
      lines.push(cells.join(delimiter));
    }

    const result = lines.join("\n");
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error al procesar el cuadro de compras." },
      { status: 500 }
    );
  }
}
