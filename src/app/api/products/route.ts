import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = params.get("q") || "";
    const category = params.get("category") || "";
    const idsParam = params.get("ids") || "";

    let rows: Array<Record<string, unknown>> = [];

    if (idsParam) {
      // Hydrate a list of products by id (used to restore cart from URL/localStorage)
      const ids = idsParam
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) return NextResponse.json({ products: [] });
      const result = await sql.query(
        `SELECT
          p.id, p.name, p.brand, p.category, p.unit,
          json_agg(
            json_build_object('supermarket_slug', s.slug, 'price', pr.price)
          ) FILTER (WHERE s.slug IS NOT NULL) as prices
         FROM products p
         LEFT JOIN prices pr ON p.id = pr.product_id
         LEFT JOIN supermarkets s ON pr.supermarket_id = s.id
         WHERE p.id = ANY($1::int[])
         GROUP BY p.id, p.name, p.brand, p.category, p.unit`,
        [ids]
      );
      rows = result.rows;
    } else if (category) {
      // Browse by category, sorted by id (cheapest available could change between calls).
      const result = await sql.query(
        `SELECT
          p.id, p.name, p.brand, p.category, p.unit,
          json_agg(
            json_build_object('supermarket_slug', s.slug, 'price', pr.price)
          ) FILTER (WHERE s.slug IS NOT NULL) as prices
         FROM products p
         LEFT JOIN prices pr ON p.id = pr.product_id
         LEFT JOIN supermarkets s ON pr.supermarket_id = s.id
         WHERE p.category = $1
         GROUP BY p.id, p.name, p.brand, p.category, p.unit
         ORDER BY p.brand, p.name
         LIMIT 100`,
        [category]
      );
      rows = result.rows;
    } else if (q.length >= 2) {
      const searchTerm = `%${q}%`;
      const result = await sql`
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
          ) FILTER (WHERE s.slug IS NOT NULL) as prices
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
      rows = result.rows;
    } else {
      return NextResponse.json({ products: [] });
    }

    const products = rows.map((row) => {
      const pricesMap: Record<string, number> = {};
      const rowPrices = row.prices as
        | Array<{ supermarket_slug?: string; price?: number }>
        | null;
      if (Array.isArray(rowPrices)) {
        for (const p of rowPrices) {
          if (p?.supermarket_slug && typeof p.price === "number") {
            pricesMap[p.supermarket_slug] = p.price;
          }
        }
      }
      return {
        id: row.id as number,
        name: row.name as string,
        brand: row.brand as string,
        category: row.category as string,
        unit: row.unit as string,
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
