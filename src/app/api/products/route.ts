import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";

    if (q.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const searchTerm = `%${q}%`;

    const { rows } = await sql`
      SELECT
        p.id,
        p.name,
        p.brand,
        p.category,
        p.unit,
        json_agg(
          json_build_object(
            'supermarket_slug', s.slug,
            'supermarket_name', s.name,
            'price', pr.price
          )
        ) as prices
      FROM products p
      LEFT JOIN prices pr ON p.id = pr.product_id
      LEFT JOIN supermarkets s ON pr.supermarket_id = s.id
      WHERE LOWER(p.name) LIKE LOWER(${searchTerm})
        OR LOWER(p.brand) LIKE LOWER(${searchTerm})
        OR LOWER(p.category) LIKE LOWER(${searchTerm})
      GROUP BY p.id, p.name, p.brand, p.category, p.unit
      ORDER BY p.name
      LIMIT 20
    `;

    const products = rows.map((row) => {
      const pricesMap: Record<string, number> = {};
      if (row.prices && Array.isArray(row.prices)) {
        for (const p of row.prices) {
          if (p.supermarket_slug) {
            pricesMap[p.supermarket_slug] = p.price;
          }
        }
      }
      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        category: row.category,
        unit: row.unit,
        prices: pricesMap,
      };
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Products search error:", error);
    return NextResponse.json(
      { error: "Error searching products" },
      { status: 500 }
    );
  }
}
