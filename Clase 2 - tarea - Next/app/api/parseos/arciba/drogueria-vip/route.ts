import { NextRequest, NextResponse } from "next/server";
import { findCol, normalizeFecha, parseAmount } from "@/lib/parseoUtils";
import { arcibaTransform, CANONICAL_HEADERS } from "@/lib/arcibaTransform";

/** Allowed alícuotas (%) - Resolución Nº 352/AGIP/2022, Anexo I. e-Arciba only accepts these. */
const ALLOWED_ALICUOTAS_RETENCION = [
  0, 0.1, 0.2, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 4, 4.5,
];
const ALLOWED_ALICUOTAS_PERCEPCION = [
  0, 0.01, 0.1, 0.2, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6,
];

function roundToNearestAllowed(value: number, allowed: number[]): number {
  if (allowed.length === 0) return value;
  let best = allowed[0];
  let bestDiff = Math.abs(value - best);
  for (let i = 1; i < allowed.length; i++) {
    const d = Math.abs(value - allowed[i]);
    if (d < bestDiff) {
      bestDiff = d;
      best = allowed[i];
    }
  }
  return best;
}

/** Canonical row: [fecha, interno, num_comp, razon_social, cuit, valor, reten, alicuota] */
function cell(row: unknown[], colIdx: number): string {
  if (colIdx < 0) return "";
  return String(row[colIdx] ?? "").trim();
}

/**
 * Percepciones input summary:
 * - Keep: fecha (refactor), interno, num_comp, razon_social, cuit, valor, reten, alicuota (×100).
 * - Discard: sucursal, comprobante, punto_venta, estado, condicion_dgi, num_imp, zona_imp, cod_rentas, certificado.
 */
function normalizarPercepciones(
  headers: string[],
  rows: unknown[][]
): { headers: string[]; rows: unknown[][] } {
  const idx = {
    fecha: findCol(headers, "fecha"),
    interno: findCol(headers, "interno"),
    num_comp: findCol(headers, "num_comp"),
    razon_social: findCol(headers, "razon_social"),
    cuit: findCol(headers, "cuit"),
    valor: findCol(headers, "valor"),
    reten: findCol(headers, "reten"),
    alicuota: findCol(headers, "alicuota"),
  };

  const canonicalRows: unknown[][] = [];
  for (const row of rows) {
    const valorNum = parseAmount(row[idx.valor]);
    if (valorNum === 0) continue;
    const alicuotaRaw = parseAmount(row[idx.alicuota]) * 100;
    const alicuotaVal = roundToNearestAllowed(alicuotaRaw, ALLOWED_ALICUOTAS_PERCEPCION);
    const retenRecomputed = Math.round((valorNum * alicuotaVal) / 100 * 100) / 100;
    const fechaRaw = cell(row, idx.fecha);
    const fecha = normalizeFecha(fechaRaw);
    canonicalRows.push([
      fecha,
      cell(row, idx.interno),
      cell(row, idx.num_comp),
      cell(row, idx.razon_social),
      cell(row, idx.cuit),
      row[idx.valor],
      retenRecomputed,
      alicuotaVal,
    ]);
  }

  return {
    headers: [...CANONICAL_HEADERS],
    rows: canonicalRows,
  };
}

/**
 * Retenciones input summary:
 * - Keep: fecha (refactor), interno, num_comp, razon_social, cuit, valor, reten.
 * - Discard: sucursal, comprobante, punto_venta, entidad, acumulado, estado, condicion_dgi, num_imp, descripcion, impuesto, afectado, tipo_proveedor, descripcion_tipo.
 * - Alicuota: not in file — compute as (reten / valor) * 100. Use first "valor" column when multiple exist.
 */
function normalizarRetenciones(
  headers: string[],
  rows: unknown[][]
): { headers: string[]; rows: unknown[][] } {
  const idx = {
    fecha: findCol(headers, "fecha"),
    interno: findCol(headers, "interno"),
    num_comp: findCol(headers, "num_comp"),
    razon_social: findCol(headers, "razon_social"),
    cuit: findCol(headers, "cuit"),
    valor: findCol(headers, "valor"),
    reten: findCol(headers, "reten"),
  };

  const canonicalRows: unknown[][] = [];
  for (const row of rows) {
    const valorNum = parseAmount(row[idx.valor]);
    if (valorNum === 0) continue;
    const fechaRaw = cell(row, idx.fecha);
    const fecha = normalizeFecha(fechaRaw);
    const retenNum = parseAmount(row[idx.reten]);
    const alicuotaRaw = (retenNum / valorNum) * 100;
    const alicuotaVal = roundToNearestAllowed(alicuotaRaw, ALLOWED_ALICUOTAS_RETENCION);
    const retenRecomputed = Math.round((valorNum * alicuotaVal) / 100 * 100) / 100;
    canonicalRows.push([
      fecha,
      cell(row, idx.interno),
      cell(row, idx.num_comp),
      cell(row, idx.razon_social),
      cell(row, idx.cuit),
      row[idx.valor],
      retenRecomputed,
      alicuotaVal,
    ]);
  }

  return {
    headers: [...CANONICAL_HEADERS],
    rows: canonicalRows,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const retenciones = body?.retenciones as
      | { headers: string[]; rows: unknown[][] }
      | undefined;
    const percepciones = body?.percepciones as
      | { headers: string[]; rows: unknown[][] }
      | undefined;

    if (
      !retenciones?.headers?.length ||
      !Array.isArray(retenciones.rows) ||
      !percepciones?.headers?.length ||
      !Array.isArray(percepciones.rows)
    ) {
      return NextResponse.json(
        { error: "Se requieren ambos archivos: Retenciones y Percepciones (con datos válidos)." },
        { status: 400 }
      );
    }

    const retCanonical = normalizarRetenciones(retenciones.headers, retenciones.rows);
    const percCanonical = normalizarPercepciones(percepciones.headers, percepciones.rows);

    const combinedHeaders = retCanonical.headers;
    const combinedRows = [...retCanonical.rows, ...percCanonical.rows];

    // arcibaTransform sorts all rows by fecha (dd/mm/yyyy) before building the TXT
    const result = arcibaTransform(combinedHeaders, combinedRows);

    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error al procesar la solicitud." },
      { status: 500 }
    );
  }
}
