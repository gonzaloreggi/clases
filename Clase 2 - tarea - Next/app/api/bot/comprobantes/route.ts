import { afipLogin } from "@/lib/afipClient";
import { formatCuitResults } from "@/lib/bulkHelpers";
import { ComprobanteType, McmpClient } from "@/lib/mcmpClient";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/bot/comprobantes
//
// Body: {
//   cuit:         string          – CUIT for AFIP login
//   password:     string          – AFIP password
//   queried_cuit: string|string[] – CUIT(s) whose comprobantes to query
//   date_from:    string          – DD/MM/YYYY
//   date_to:      string          – DD/MM/YYYY
//   type?:        string          – "E" (emitidos) | "R" (recibidos)
//                                   omit to fetch both
// }
//
// Single CUIT  → { success, emitidos?, recibidos?, type?, comprobantes? }
// Multi  CUITs → { success, results: { [cuit]: { emitidos?, recibidos? } } }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cuit, password, queried_cuit, date_from, date_to, type } = body;

    if (!cuit || !password || !queried_cuit || !date_from || !date_to) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["cuit", "password", "queried_cuit", "date_from", "date_to"],
          optional: ["type (E|R, omit for both)"],
        },
        { status: 400 },
      );
    }

    const types: ComprobanteType[] = type ? [type] : ["E", "R"];
    const queriedCuits: string[] = Array.isArray(queried_cuit)
      ? queried_cuit
      : [queried_cuit];

    if (queriedCuits.length === 0 || queriedCuits.some((c) => !c)) {
      return NextResponse.json(
        { error: "queried_cuit must be a non-empty string or array of strings" },
        { status: 400 },
      );
    }

    // 1. Login to AFIP portal
    const { portalCookies } = await afipLogin(cuit, password);

    // 2. Fetch comprobantes via McmpClient
    const client = new McmpClient(cuit, portalCookies);
    const allResults = await client.fetchComprobantes({
      queriedCuits,
      dateFrom: date_from,
      dateTo: date_to,
      types,
    });

    // 3. Build response (backward-compatible for single CUIT)
    if (queriedCuits.length === 1) {
      return NextResponse.json({
        success: true,
        ...formatCuitResults(types, allResults.get(queriedCuits[0])!),
      });
    }

    const results: Record<string, unknown> = {};
    for (const [qCuit, cuitResults] of allResults) {
      results[qCuit] = formatCuitResults(types, cuitResults);
    }
    return NextResponse.json({ success: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Error in comprobantes flow", details: message },
      { status: 500 },
    );
  }
}

