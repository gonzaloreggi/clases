import { afipLogin, formatCookies } from "@/lib/afipClient";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/bot
// Body: { cuit: string, password: string }
// Returns: { success, jwt, cookies, portalCookieHeader }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cuit, password } = body;

    if (!cuit || !password) {
      return NextResponse.json(
        { error: "Missing cuit or password" },
        { status: 400 }
      );
    }

    const { jwt, authCookies, portalCookies } = await afipLogin(cuit, password);

    return NextResponse.json({
      success: true,
      jwt,
      cookies: {
        auth: authCookies,
        portal: portalCookies,
      },
      portalCookieHeader: formatCookies(portalCookies),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Error during AFIP login flow", details: message },
      { status: 500 }
    );
  }
}
