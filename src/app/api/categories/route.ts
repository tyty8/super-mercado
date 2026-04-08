import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT category, COUNT(*)::int as count
      FROM products
      GROUP BY category
      ORDER BY category
    `;
    return NextResponse.json({ categories: rows });
  } catch (error) {
    console.error("Categories error:", error);
    return NextResponse.json(
      { error: "Error fetching categories" },
      { status: 500 }
    );
  }
}
