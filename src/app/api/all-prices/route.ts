import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.brand,
        p.category,
        p.unit,
        MAX(CASE WHEN s.slug = 'jumbo' THEN pr.price END) as jumbo,
        MAX(CASE WHEN s.slug = 'lider' THEN pr.price END) as lider,
        MAX(CASE WHEN s.slug = 'tottus' THEN pr.price END) as tottus,
        MAX(CASE WHEN s.slug = 'unimarc' THEN pr.price END) as unimarc,
        MAX(CASE WHEN s.slug = 'santa-isabel' THEN pr.price END) as santa_isabel
      FROM products p
      LEFT JOIN prices pr ON p.id = pr.product_id
      LEFT JOIN supermarkets s ON pr.supermarket_id = s.id
      GROUP BY p.id, p.name, p.brand, p.category, p.unit
      ORDER BY p.category, p.brand, p.name
    `;

    return NextResponse.json({ prices: rows });
  } catch (error) {
    console.error("All prices error:", error);
    return NextResponse.json(
      { error: "Error fetching prices" },
      { status: 500 }
    );
  }
}
