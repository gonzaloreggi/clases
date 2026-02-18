import { NextRequest, NextResponse } from "next/server";
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

    const result = sussTransform(headers, rows);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error processing request" },
      { status: 500 }
    );
  }
}
