import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { findCol, findColContaining } from "@/lib/parseoUtils";

/** Try multiple header names; returns index of first match or -1. */
function findColByNames(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = findCol(headers, name);
    if (idx >= 0) return idx;
  }
  const containing = names.find((n) => n.includes(" ") || n.length > 4);
  if (containing) {
    const idx = findColContaining(headers, containing.split(" ")[0]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Canonical header names used by ivaTransform. */
const CANONICAL = {
  col493: "493",
  cuit: "CUIT",
  fecha: "FECHA PERCEPCION",
  puntoVenta: "PUNTO DE VENTA",
  numeroComprobante: "NUMERO DE COMPROBANTE",
  importe: "IMPORTE",
} as const;

/** Normalize headers so ivaTransform finds columns. Tries common variants (general + cuadro compras). */
function normalizeHeadersForIva(headers: string[]): { normalized: string[]; missing: string[] } {
  const normalized = [...headers];
  const missing: string[] = [];

  const trySet = (canonical: string, names: string[]): boolean => {
    const idx = findColByNames(headers, names);
    if (idx >= 0) {
      normalized[idx] = canonical;
      return true;
    }
    missing.push(canonical);
    return false;
  };

  trySet(CANONICAL.col493, ["493", "Col493", "Codigo", "Código"]);
  trySet(CANONICAL.cuit, ["CUIT", "Cuit", "C.U.I.T.", "Cuit Proveedor", "Proveedor CUIT"]);
  trySet(
    CANONICAL.fecha,
    ["FECHA PERCEPCION", "FECHA", "Fecha", "FECHA EMISION", "Fecha Emisión", "Fecha de comprobante", "Fecha Comprobante"]
  );
  trySet(CANONICAL.puntoVenta, ["PUNTO DE VENTA", "Punto de Venta", "Pto. Venta", "Punto Venta", "PV"]);
  trySet(CANONICAL.numeroComprobante, ["NUMERO DE COMPROBANTE", "Número de Comprobante", "Nº Comprobante", "Numero Comprobante", "Número", "Comprobante"]);
  trySet(CANONICAL.importe, ["IMPORTE", "Importe", "IMPORTE TOTAL", "Monto", "Total", "Importe Total"]);

  return { normalized, missing };
}

function escapeCsvField(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatDateYYYYMMDD(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
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
    return s;
  }
  const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return [y!, m!.padStart(2, "0"), d!.padStart(2, "0")].join("-");
  }
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) return s.replace(/[\/\-]/g, "-");
  return s;
}

function ivaTransform(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0 || headers.length === 0) return "";

  const idxCol493 = findCol(headers, "493");
  const idxCuit = findCol(headers, "CUIT");
  const idxFecha =
    findCol(headers, "FECHA PERCEPCION") >= 0
      ? findCol(headers, "FECHA PERCEPCION")
      : findColContaining(headers, "FECHA");
  const idxPuntoVenta = findCol(headers, "PUNTO DE VENTA");
  const idxNumeroComprobante = findCol(headers, "NUMERO DE COMPROBANTE");
  const idxImporte = findCol(headers, "IMPORTE");

  const delimiter = ";";
  const lines: string[] = [];

  for (const row of rows) {
    const col493 = idxCol493 >= 0 ? String(row[idxCol493] ?? "").trim() : "";
    const primeraCol = col493 !== "" ? col493 : "493";
    const cuit = idxCuit >= 0 ? String(row[idxCuit] ?? "").trim() : "";
    const fechaRaw = idxFecha >= 0 ? row[idxFecha] : "";
    const puntoVenta = idxPuntoVenta >= 0 ? String(row[idxPuntoVenta] ?? "").trim() : "";
    const numeroComprobante = idxNumeroComprobante >= 0 ? String(row[idxNumeroComprobante] ?? "").trim() : "";
    const importe = idxImporte >= 0 ? String(row[idxImporte] ?? "").trim() : "";

    const fecha = formatDateYYYYMMDD(fechaRaw);
    const comprobanteFormateado =
      String(puntoVenta).padStart(5, "0") + "-" + String(numeroComprobante).padStart(8, "0");

    const cells = [
      escapeCsvField(primeraCol),
      escapeCsvField(cuit),
      "",
      escapeCsvField(fecha),
      "1",
      escapeCsvField(comprobanteFormateado),
      escapeCsvField(importe),
    ];
    lines.push(cells.join(delimiter));
  }

  return lines.join("\n");
}

const REQUIRED_COLUMNS = [CANONICAL.cuit, CANONICAL.fecha, CANONICAL.importe];

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

    const { normalized, missing } = normalizeHeadersForIva(headers);
    const missingRequired = REQUIRED_COLUMNS.filter((col) => missing.includes(col));
    if (missingRequired.length > 0) {
      return NextResponse.json(
        {
          error: "Faltan columnas requeridas en el archivo.",
          missingColumns: missingRequired,
          hint: "Se esperan columnas como: CUIT, FECHA (o FECHA PERCEPCION), IMPORTE. Pueden tener nombres similares (ej. Cuit, Fecha Emisión, Importe Total).",
        },
        { status: 400 }
      );
    }

    const result = ivaTransform(normalized, rows);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error processing request" },
      { status: 500 }
    );
  }
}
