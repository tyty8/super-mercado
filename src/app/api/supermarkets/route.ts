import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { rows } = await sql`SELECT * FROM supermarkets ORDER BY name`;
    return NextResponse.json({ supermarkets: rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Error fetching supermarkets" },
      { status: 500 }
    );
  }
}
