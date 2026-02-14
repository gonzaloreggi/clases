import { NextRequest, NextResponse } from "next/server";
import { arcibaTransform } from "@/lib/arcibaTransform";

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

    const result = arcibaTransform(headers, rows);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Error processing request" },
      { status: 500 }
    );
  }
}
