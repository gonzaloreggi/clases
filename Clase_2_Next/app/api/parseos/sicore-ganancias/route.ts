import { NextRequest, NextResponse } from "next/server";
import {
  cellDigits,
  cellStr,
  findCol,
  formatNumber,
  normalizeFecha,
  parseAmount,
  sortRowsByFecha,
} from "@/lib/parseoUtils";

function sicoreTransform(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0 || headers.length === 0) return "";

  const idx = {
    fecha: findCol(headers, "fecha"),
    num_comp: findCol(headers, "num_comp"),
    punto_venta: findCol(headers, "punto_venta"),
    cuit: findCol(headers, "cuit"),
    valor: findCol(headers, "valor"),
    reten: findCol(headers, "reten"),
  };

  const sortedRows = sortRowsByFecha(rows, idx.fecha);

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
    const fecha = normalizeFecha(cellStr(row, idx.fecha));
    const num_comp = cellStr(row, idx.num_comp);
    const punto_venta = cellStr(row, idx.punto_venta);
    const valorNum = parseAmount(row[idx.valor]);
    const retenNum = parseAmount(row[idx.reten]);
    const cuit = cellDigits(row, idx.cuit);
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
      formatNumber(valorNum, 16, " ") +
      "0217" +
      "078" +
      "1" +
      formatNumber(valorNum, 14, " ") +
      fecha10 +
      "01" +
      "0" +
      formatNumber(retenNum, 14, " ") +
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

    const result = sicoreTransform(headers, rows);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error processing request" },
      { status: 500 }
    );
  }
}
