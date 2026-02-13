import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { findCol, findColContaining } from "@/lib/parseoUtils";

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

    const result = ivaTransform(headers, rows);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error processing request" },
      { status: 500 }
    );
  }
}
